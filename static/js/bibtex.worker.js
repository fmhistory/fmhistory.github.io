// bibtex.worker.js

// Importa la librería bibtexParse desde tu ruta local.
// La ruta es relativa a la ubicación del propio worker script (static/js/).
// Por lo tanto, sube un nivel (../) para ir a static/, y luego baja a vendor/.
self.importScripts('../vendor/bibtexParse.js');

// Escuchamos el contenido del .bib enviado por el hilo principal
self.addEventListener('message', (e) => {
    const bibtexContent = e.data;
    try {
        // Ejecución síncrona, pero aislada del hilo principal
        const publicationsJSON = bibtexParse.toJSON(bibtexContent);
        
        // Enviamos el JSON resultante
        self.postMessage({ status: 'success', data: publicationsJSON });
        
    } catch (error) {
        // En caso de error de sintaxis o de parseo
        self.postMessage({ status: 'error', message: error.message, error: error });
    }
});