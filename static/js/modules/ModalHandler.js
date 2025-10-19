// js/modules/ModalHandler.js

// Asumimos que Bootstrap JS está cargado globalmente
// Nota: La variable 'bootstrap' debe estar disponible globalmente (cargada via script en HTML)
const modalElement = document.getElementById('publicationModal');
const modalBootstrap = new bootstrap.Modal(modalElement);

// Elementos del DOM del modal
const modalTitle = document.getElementById('publicationModalLabel');
const modalYear = document.getElementById('publicationModalYear');
const modalBody = modalElement.querySelector('.modal-body');

/**
 * Muestra el modal de Bootstrap con los datos del nodo clickeado,
 * utilizando la lógica detallada del código antiguo.
 * @param {Object} d - El objeto nodo (Milestone) completo.
 */
export function showNodeDetails(d) {
    // 1. Llenar el Header
    modalTitle.textContent = d.longtitle || d.title || 'Milestone';
    const yearText = d.year ? `(${d.year})` : '';
    modalYear.textContent = yearText;

    // 2. Preparar los datos
    const categoryPath = d.hierarchy ? d.hierarchy.join(' ➔ ') : '';
    const concepts = d.concepts ? d.concepts.join(', ') : '';
    const urlValue = d.doi || d.url;
    const linkText = urlValue || '-';
    
    // Generar la cadena de Referencia completa (tal cual estaba en el código antiguo)
    const textReference = `${d.authors}. ${d.title}.${d.journal || d.booktitle ? ` ${d.journal || d.booktitle},` : ''} ${d.year}. ${d.volume ? `${d.volume}:` : ''}${d.pages ? ` ${d.pages.replace(/--/g, '-')}.` : ''}${d.address ? ` ${d.address}.` : ''} ${d.doi ? `${d.doi}` : d.url ? `${d.url}` : ''}${d.awards && d.awards.length > 0 ? ` ${d.awards.map(i => ` «${i}»`).join(', ')}` : ''}`;

    // 3. Rellenar el contenido HTML
    modalBody.innerHTML = `
        <div class="mb-3">
            ${d.description ? `<p><span class="historical-text">${d.description}</span></p>` : ''}
            ${categoryPath ? `<p><strong>Category:</strong> ${categoryPath}</p>` : ''}
            ${d.concepts ? `<p><strong>Main concepts:</strong> ${concepts}</p>` : ''}
            ${d.awards && d.awards.length > 0 ? `<p><strong>Awards:</strong> ${d.awards.map(i => ` «${i}»`).join(', ')}</p>` : ''}
        </div>

        <hr style="border-top: 2px solid #ccc; opacity: 1;"> 

        <div class="mt-3">
            <h6 class="text-secondary">Publication details:</h6>
            ${d.authors ? `<p><strong>Authors:</strong> ${d.authors}</p>` : ''}
            ${d.pubtitle ? `<p><strong>Title:</strong> ${d.pubtitle}</p>` : ''}
            ${d.journal ? `<p><strong>Journal:</strong> ${d.journal}</p>` : ''} 
            ${d.booktitle ? `<p><strong>Conference:</strong> ${d.booktitle}</p>` : ''}
            ${d.volume ? `<p><strong>Volume:</strong> ${d.volume}</p>` : ''}
            ${d.year ? `<p><strong>Date:</strong> ${d.month ? d.month : ''} ${d.year}</p>` : ''}
            ${d.address ? `<p><strong>Address:</strong> ${d.address}</p>` : ''}
            ${d.publisher ? `<p><strong>Publisher:</strong> ${d.publisher}<p>` : ''}
            ${d.citations ? `<p><strong>Citations (Semantic Scholar):</strong> ${d.citations}</p>` : ''}
            ${urlValue ? `<p><strong>DOI/Handle/URL:</strong> <a href="${urlValue}" target="_blank" rel="noopener noreferrer">${linkText}</a></p>` : ''}
            <hr style="border-top: 1px solid #ccc;">
            ${textReference ? `<p><strong>Reference:</strong> <span id="fullReferenceText">${textReference}</span></p>` : ''}
            <div class="d-flex justify-content-center mt-3">
                <button type="button" class="btn btn-outline-dark me-2" id="copyTextBtn">🏷️ Copy Reference</button>
                <button type="button" class="btn btn-outline-dark" id="copyBibBtn">🗎 Copy BibTeX</button>
            </div>
        </div>
    `;
    
    // 4. Mostrar el modal (IMPORTANTE: Esto debe hacerse antes de adjuntar listeners)
    modalBootstrap.show();

    // 5. Adjuntar Event Listeners a los botones
    
    // A. Listener para Copiar Referencia
    // Usamos la variable local textReference generada en el paso 2.
    document.getElementById("copyTextBtn").addEventListener("click", () => {
        navigator.clipboard.writeText(textReference)
            .then(() => alert("Referencia copiada al portapapeles!"))
            .catch(err => console.error("Fallo al copiar texto: ", err));
    }, { once: true }); // Usar { once: true } para evitar duplicados si el modal se reutiliza

    // B. Listener para Copiar BibTeX
    document.getElementById("copyBibBtn").addEventListener("click", () => {
        // d.bibtexContent debe venir de los datos del nodo.
        const bibtex = d.bibtexContent || "Contenido BibTeX no disponible";
        navigator.clipboard.writeText(bibtex)
            .then(() => alert("BibTeX copiado al portapapeles!"))
            .catch(err => console.error("Fallo al copiar BibTeX: ", err));
    }, { once: true });
}

// Exportar la función principal
// Note: No exportamos hideNodeDetails ya que los botones de Bootstrap ya cierran el modal.