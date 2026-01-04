/**
 * main.js
 * * Punto de entrada de la aplicación, usando Módulos ECMAScript.
 */
import { DataProcessor } from './modules/DataProcessor.js';
import { Timeline } from './modules/Timeline.js';
import { showNodeDetails } from './modules/ModalHandler.js';
window.showNodeDetails = showNodeDetails;  // Hacer accesible globalmente para d3.js

// d3.js se usa como global (window.d3) ya que se cargó con un script estándar
const d3 = window.d3; 


// Definiciones de la aplicación
const DATA_PATH = 'static/data/';
const JSON_FILE = 'timeline_data.json';
const BIB_FILE = 'publications.bib';
const CONTAINER_SELECTOR = '#timeline'; 

/**
 * Función principal asíncrona para manejar la carga de datos.
 */
async function initialize() {
    console.log("Initalizing data loading with modules...");

    try {
        // 1. Cargar datos en paralelo usando Promise.all
        const [fmEvents, bibText] = await Promise.all([
            d3.json(DATA_PATH + JSON_FILE), // Eventos
            d3.text(DATA_PATH + BIB_FILE)   // Referencias (texto crudo)
        ]);

        console.log("Data loaded successfully. Processing...");

        // 2. Procesar y combinar los datos usando el módulo DataProcessor
        const processedData = DataProcessor.processAndCombine(fmEvents, bibText);
        
        // 3. Inicializar y renderizar la visualización
        const timeline = new Timeline(CONTAINER_SELECTOR, processedData);
        timeline.render();
    } catch (error) {
        console.error("Critical error during initialization:", error);
    }
}

// Iniciar la aplicación
initialize();