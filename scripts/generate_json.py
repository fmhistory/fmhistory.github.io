import os
import json
import time
import requests
import argparse
import frontmatter
import bibtexparser

# --- CONFIGURACIÓN (Asegúrate de que estas rutas son correctas) ---
MILESTONES_DIR = 'milestones'
JSON_FILE = 'static/data/timeline_data.json'
BIB_FILE = 'static/data/publications.bib'
CACHE_FILE = 'scripts/process_cache.json'
API_BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/DOI:'

NORMAL_DELAY = 3
MAX_RETRIES = 2

# ==========================================
# 1. GESTIÓN DE CACHÉ Y ARCHIVOS
# ==========================================

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f: return json.load(f)
    return {}

def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, 'w') as f: json.dump(cache, f, indent=4)

def load_existing_json():
    if os.path.exists(JSON_FILE):
        try:
            with open(JSON_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # IMPORTANTE: Si el JSON no tiene la estructura correcta, devolvemos default
                if isinstance(data, dict) and "nodes" in data:
                    return data
        except Exception as e:
            print(f"⚠️ No se pudo leer el JSON previo: {e}")
    return {"nodes": [], "links": []}

# ==========================================
# 2. PROCESAMIENTO
# ==========================================

def get_doi_map_from_bib(bib_path):
    if not os.path.exists(bib_path): return {}
    with open(bib_path, 'r', encoding='utf-8') as f:
        db = bibtexparser.load(f)
    return {e.get('ID'): (e.get('doi') or e.get('DOI')).strip().replace('\\', '') 
            for e in db.entries if (e.get('doi') or e.get('DOI'))}

def process_markdown_files(cache, nodes_dict):
    """Actualiza nodes_dict basándose en los archivos MD."""
    if not os.path.exists(MILESTONES_DIR):
        print(f"❌ Error: No existe la carpeta {MILESTONES_DIR}")
        return False

    files = [f for f in os.listdir(MILESTONES_DIR) if f.endswith('.md')]
    any_change = False
    
    # Lista de IDs que existen actualmente en archivos físicos
    present_ids = []

    for filename in files:
        path = os.path.join(MILESTONES_DIR, filename)
        mtime = os.path.getmtime(path)
        
        # Leemos el archivo si es nuevo o ha cambiado
        if cache.get(filename) != mtime or filename not in cache:
            print(f"📄 Procesando archivo: {filename}")
            post = frontmatter.load(path)
            metadata = post.metadata
            
            # NORMALIZACIÓN: Asegurar que 'id' y 'parents' existan
            node_id = metadata.get('id')
            if not node_id:
                print(f"⚠️ El archivo {filename} no tiene 'id' en el frontmatter.")
                continue

            # Forzamos que parents sea siempre una lista
            if 'parents' not in metadata or metadata['parents'] is None:
                metadata['parents'] = []
            elif isinstance(metadata['parents'], str):
                metadata['parents'] = [metadata['parents']]
            
            # Preservar citas si el nodo ya estaba en el diccionario
            if node_id in nodes_dict:
                metadata['citations'] = nodes_dict[node_id].get('citations', 0)
            
            nodes_dict[node_id] = metadata
            cache[filename] = mtime
            any_change = True
        
    return any_change

def update_node_citations(nodes_dict, doi_map, force_update):
    updated = False
    for nid, node in nodes_dict.items():
        doi = doi_map.get(nid)
        if doi and (node.get('citations') in [0, None] or force_update):
            print(f"📡 Consultando citas para: {nid}")
            count = fetch_citations_from_api(doi)
            if count is not None:
                node['citations'] = count
                updated = True
                time.sleep(NORMAL_DELAY)
    return updated

def fetch_citations_from_api(doi):
    url = f"{API_BASE_URL}{doi}?fields=citationCount"
    try:
        res = requests.get(url, timeout=10)
        return res.json().get('citationCount') if res.status_code == 200 else None
    except: return None

# ==========================================
# 3. ORQUESTADOR
# ==========================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force-citations', action='store_true')
    args = parser.parse_args()

    cache = load_cache()
    data = load_existing_json()
    doi_map = get_doi_map_from_bib(BIB_FILE)
    
    # Cargamos nodos actuales indexados por ID
    nodes_dict = {n['id']: n for n in data.get('nodes', []) if 'id' in n}
    
    # 1. Procesar archivos MD
    changed_md = process_markdown_files(cache, nodes_dict)
    
    # 2. Citas
    changed_citations = update_node_citations(nodes_dict, doi_map, args.force_citations)

    # 3. RECONSTRUCCIÓN DE LINKS (EL CORAZÓN DEL PROBLEMA)
    # Reconstruimos los links SIEMPRE, no solo si hay cambios, para asegurar integridad
    all_nodes = list(nodes_dict.values())
    all_links = []
    
    # Creamos un set de IDs para validación rápida
    valid_ids = {node['id'] for node in all_nodes}

    print(f"🔗 Reconstruyendo enlaces para {len(all_nodes)} nodos...")
    
    for node in all_nodes:
        # Buscamos la lista de padres en el nodo
        parents = node.get('parents', [])
        
        for p_id in parents:
            if p_id in valid_ids:
                all_links.append({
                    "source": p_id, 
                    "target": node['id']
                })
            else:
                print(f"   ⚠️ Link roto: {node['id']} -> {p_id} (El ID padre no existe)")

    # Ordenar por año
    all_nodes.sort(key=lambda x: x.get('year', 0))

    # 4. GUARDAR
    # Guardamos siempre si hay cambios detectados
    if changed_md or changed_citations or len(all_links) >= 0:
        output = {"nodes": all_nodes, "links": all_links}
        
        # Aseguramos que la carpeta de destino existe
        os.makedirs(os.path.dirname(JSON_FILE), exist_ok=True)
        
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=4, ensure_ascii=False)
        
        save_cache(cache)
        print(f"✅ Éxito: {len(all_nodes)} nodos y {len(all_links)} enlaces guardados en {JSON_FILE}")
    else:
        print("☕ No se detectaron cambios en los archivos ni en las citas.")

if __name__ == "__main__":
    main()