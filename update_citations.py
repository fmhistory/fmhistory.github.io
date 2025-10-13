import json
import requests
import time
import bibtexparser 
import argparse # Importar la librería para manejar argumentos

# --- CONFIGURACIÓN ---
JSON_FILE = 'static/data/timeline_data.json'
BIB_FILE = 'static/data/publications.bib' 
API_BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/DOI:'

# Configuración de control de tasa
NORMAL_DELAY_SECONDS = 5    
TIMEOUT_SECONDS = 15        
MAX_RETRIES = 3             
LONG_WAIT_SECONDS = 120     
# ---------------------

def get_doi_map_from_bib(bib_path):
    """Carga y parsea el archivo BibTeX para crear un mapa de ID -> DOI."""
    print(f"Cargando y parseando BibTeX desde {bib_path}...")
    try:
        with open(bib_path, 'r', encoding='utf-8') as bibfile:
            bib_database = bibtexparser.load(bibfile)
    except FileNotFoundError:
        print(f"Error: Archivo BIB {bib_path} no encontrado.")
        return {}

    doi_map = {}
    for entry in bib_database.entries:
        bib_key = entry.get('ID') 
        doi = entry.get('doi') or entry.get('DOI')
        
        if bib_key and doi:
            doi_map[bib_key] = doi.strip().replace('\\', '')
            
    print(f"✅ Se encontraron {len(doi_map)} entradas con DOI en el archivo BIB.")
    return doi_map

def fetch_citations_robust(doi, attempts=MAX_RETRIES):
    """Realiza la consulta a la API con manejo de errores y reintentos."""
    url = f"{API_BASE_URL}{doi}?fields=citationCount"
    
    for attempt in range(attempts):
        try:
            response = requests.get(url, timeout=TIMEOUT_SECONDS)
            
            if response.status_code == 429:
                print(f"\n!!! LÍMITE DE TASA ALCANZADO (429). Esperando {LONG_WAIT_SECONDS} segundos y reintentando...")
                time.sleep(LONG_WAIT_SECONDS)
                continue
            
            if response.status_code >= 500:
                print(f"Error 5xx en el intento {attempt + 1}: {response.status_code}. Reintentando en {NORMAL_DELAY_SECONDS}s.")
                time.sleep(NORMAL_DELAY_SECONDS)
                continue
                
            if response.status_code >= 400:
                print(f"❌ Error irrecuperable (4xx) para el DOI: {doi}. Código: {response.status_code}")
                return None
            
            s2_data = response.json()
            return s2_data.get('citationCount')

        except requests.exceptions.Timeout:
            print(f"❌ Timeout de conexión en el intento {attempt + 1}. Reintentando en {NORMAL_DELAY_SECONDS}s.")
            time.sleep(NORMAL_DELAY_SECONDS)
            continue
        except requests.exceptions.RequestException as e:
            print(f"❌ Error de conexión general en el intento {attempt + 1}: {e}. Reintentando en {NORMAL_DELAY_SECONDS}s.")
            time.sleep(NORMAL_DELAY_SECONDS)
            continue
            
    print(f"🔴 Fallo después de {MAX_RETRIES} intentos para el DOI: {doi}")
    return None

def update_citations(only_missing=False):
    """
    Actualiza el recuento de citas de los nodos en el archivo JSON.
    :param only_missing: Si es True, solo actualiza las citas que son 0 o no están definidas.
    """
    doi_map = get_doi_map_from_bib(BIB_FILE)
    if not doi_map: return

    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            nodes = data.get('nodes', [])
    except FileNotFoundError:
        print(f"Error: Archivo JSON {JSON_FILE} no encontrado.")
        return

    updated_count = 0
    skipped_count = 0
    
    for node in nodes:
        node_id = node.get('id')
        doi_value = doi_map.get(node_id)
        
        if doi_value:
            current_citations = node.get('citations')
            
            # --- LÓGICA DE FILTRADO (CLAVE) ---
            should_update = True
            if only_missing:
                # Si 'citations' no existe (None) O es 0
                if current_citations is not None and current_citations > 0:
                    should_update = False
                    skipped_count += 1
                    print(f"-> Saltando {node_id} (Citas actuales: {current_citations})...")
            # --- FIN LÓGICA DE FILTRADO ---

            if should_update:
                citation_count = fetch_citations_robust(doi_value)
                
                if citation_count is not None:
                    # ÉXITO: Actualizar solo si la consulta fue exitosa
                    node['citations'] = citation_count
                    updated_count += 1
                    print(f" -> Éxito. Citas: {citation_count}")
                else:
                    # ERROR: Conservar el valor anterior si la consulta falla
                    node['citations'] = current_citations if current_citations is not None else 0
                    print(f" -> Fallo de consulta. Conservando citas anteriores: {node['citations']}")
            
            # Pausa para respetar el límite de tasa (solo si se consultó la API)
            if should_update:
                 time.sleep(NORMAL_DELAY_SECONDS) 
        else:
            # No hay DOI para esta entrada, se omite.
            pass 

    print(f"\n--- Resumen ---")
    print(f"✅ Nodos actualizados con nuevas citas: {updated_count}")
    print(f"⏭️ Nodos omitidos (citas > 0): {skipped_count}")

    # Guardar el archivo JSON actualizado, asegurando que los emojis se conserven
    print(f"Guardando cambios en {JSON_FILE}...")
    try:
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("✅ Actualización completa.")
    except Exception as e:
        print(f"❌ Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    # Configurar el parser de argumentos
    parser = argparse.ArgumentParser(description="Actualiza el recuento de citas de publicaciones usando la API de Semantic Scholar.")
    parser.add_argument('--only-missing', action='store_true', 
                        help="Si se establece, solo actualiza publicaciones con 'citations' igual a 0 o no definido.")
    
    args = parser.parse_args()
    
    update_citations(only_missing=args.only_missing)