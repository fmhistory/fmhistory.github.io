import json
import requests
import time
import bibtexparser
import sys # Para salir del script en caso de error grave

# --- CONFIGURACIÓN ---
JSON_FILE = 'static/data/timeline_data.json'
BIB_FILE = 'static/data/publications.bib' 
API_BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/DOI:'

# Configuración de control de tasa
NORMAL_DELAY_SECONDS = 5    # Pausa entre peticiones (aumentado a 5s para mayor seguridad)
TIMEOUT_SECONDS = 15        # Tiempo máximo para esperar la respuesta de la API
MAX_RETRIES = 3             # Número de intentos en caso de error temporal (503, 504)
LONG_WAIT_SECONDS = 120     # Tiempo de espera en caso de error 429 (Límite de Tasa)
# ---------------------

def get_doi_map_from_bib(bib_path):
    """Carga y parsea el archivo BibTeX para crear un mapa de ID -> DOI."""
    # ... (Esta función es igual que antes, asumo que funciona correctamente)
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
            doi_map[bib_key] = doi.strip().replace('\\', '') # Limpieza de DOI
            
    print(f"✅ Se encontraron {len(doi_map)} entradas con DOI en el archivo BIB.")
    return doi_map

def fetch_citations_robust(doi, attempts=MAX_RETRIES):
    """Realiza la consulta a la API con manejo de errores y reintentos."""
    url = f"{API_BASE_URL}{doi}?fields=citationCount"
    
    for attempt in range(attempts):
        try:
            # 1. Realizar la petición con Timeout
            response = requests.get(url, timeout=TIMEOUT_SECONDS)
            
            # 2. Manejo de Errores de API y Límite de Tasa
            if response.status_code == 429:
                # Error de Límite de Tasa: Espera larga y termina el intento
                print(f"\n!!! LÍMITE DE TASA ALCANZADO (429). Esperando {LONG_WAIT_SECONDS} segundos y reintentando...")
                time.sleep(LONG_WAIT_SECONDS)
                continue # Continuar al siguiente intento
            
            # Errores del Servidor (5xx) o Conexión/Timeouts
            if response.status_code >= 500:
                print(f"Error 5xx en el intento {attempt + 1}: {response.status_code}. Reintentando en {NORMAL_DELAY_SECONDS}s.")
                time.sleep(NORMAL_DELAY_SECONDS)
                continue
                
            # Errores de Cliente (4xx) que no son 429 (ej. 404 Not Found)
            if response.status_code >= 400:
                # 400 Bad Request, 404 Not Found: El DOI no es válido o no existe. No reintentar.
                print(f"❌ Error irrecuperable (4xx) para el DOI: {doi}. Código: {response.status_code}")
                return None # Indicar fallo irrecuperable
            
            # Éxito (2xx)
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
    return None # Retorna None si falla después de todos los intentos

def update_citations():
    # 1. Obtener el mapa de ID a DOI y cargar el JSON
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
    
    # 2. Iterar y actualizar
    for node in nodes:
        node_id = node.get('id')
        doi_value = doi_map.get(node_id)
        
        if doi_value:
            # Consulta robusta a la API
            citation_count = fetch_citations_robust(doi_value)
            
            if citation_count is not None:
                # 3. ÉXITO: Actualizar solo si la consulta fue exitosa
                node['citations'] = citation_count
                updated_count += 1
                print(f" -> Éxito. Citas: {citation_count}")
            else:
                # 4. ERROR: Si citation_count es None, el script falló pero no actualiza el nodo.
                current_citations = node.get('citations', 0)
                print(f" -> Fallo de consulta. Conservando citas anteriores: {current_citations}")
        
            # 5. Pausa normal entre peticiones exitosas o fallidas (para no saturar)
            time.sleep(NORMAL_DELAY_SECONDS) 
        else:
            # No hay DOI para esta entrada, se omite.
            pass 

    # 6. Guardar el archivo JSON actualizado
    print(f"\nGuardando {updated_count} citas actualizadas en {JSON_FILE}...")
    try:
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("✅ Actualización completa.")
    except Exception as e:
        print(f"❌ Error al guardar el archivo JSON: {e}")

if __name__ == "__main__":
    update_citations()