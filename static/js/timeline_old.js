// --- timeline.js (Módulo Principal) ---

// CONFIGURACIÓN GLOBAL ESTÁTICA
const CONFIG = {
    // ---------------------------------------------------------------------
    // AJUSTES DE MARGEN Y DIMENSIONES
    // ---------------------------------------------------------------------
    margin: { top: 50, right: 30, bottom: 50, left: 200 }, // Margen alrededor del área de dibujo del gráfico.
    
    WIDTH_MULTIPLIER: 2.5, // ⭐ CONTROL DEL ESPACIO ENTRE AÑOS: Aumenta el ancho de cálculo (this.width) para separar las columnas verticales de los años. 1.0 = ancho normal, 1.8 = 80% más ancho.

    // ---------------------------------------------------------------------
    // COMPORTAMIENTO VERTICAL (JITTERING y Repulsión)
    // ---------------------------------------------------------------------
    JITTER_AMOUNT: 50, // Máxima distancia vertical (en píxeles) para dispersar hitos que caen en el mismo año. Un valor menor aumenta la compactación hacia la línea central.
    DEVIATION_OFFSET: 0, // Desplazamiento de control para la curvatura de los enlaces (paths). 0 = Enlaces rectos.

    REPULSION_THRESHOLD: 8, // Distancia mínima a la que los nodos deben mantenerse alejados de las líneas de categorías vecinas.
    REPULSION_FORCE_FACTOR: 0.5, // Fuerza con la que los nodos son empujados lejos de las líneas de categorías.

    // ---------------------------------------------------------------------
    // CAJAS (BOUNDING BOXES)
    // ---------------------------------------------------------------------
    BOX_PADDING: 15, // Relleno (padding) alrededor de los hitos al calcular el tamaño de las bounding boxes (cuadros punteados).
    
    // ---------------------------------------------------------------------
    // NODOS (HITOS)
    // ---------------------------------------------------------------------
    NODE_RADIUS: 4, // Radio del círculo de cada hito (nodo).
    
    // ---------------------------------------------------------------------
    // ALGORITMO DE COLISIONES DE ETIQUETAS
    // ---------------------------------------------------------------------
    SEPARATION_PADDING: 5, // Espacio mínimo requerido entre cajas de etiquetas (en píxeles) para evitar colisiones.
    MAX_COLLISION_ITERATIONS: 100, // Número máximo de veces que el algoritmo intentará resolver las superposiciones de etiquetas.
    COLLISION_FORCE_STRENGTH: 1.0, // Intensidad con la que las etiquetas se repelen entre sí cuando colisionan (mayor = empuje más fuerte).
    
    // ---------------------------------------------------------------------
    // UTILIDADES INTERNAS
    // ---------------------------------------------------------------------
    TEMP_PATH_DELIMITER: '|', // Carácter usado internamente para concatenar la jerarquía de categorías.
};


// Mapa para que el modal muestre el tipo de publicación
const typesMap = {
        journal: 'Journal',
        conference: 'International conference',
        workshop: 'International workshop',
        national: 'National conference',
        dataArtifacts: 'Data and artifacts',
        book: 'Books and PhD thesis',
        editorship: 'Editorship',
        other: 'Informal and other publications' // Otros tipos
    };

// --- FUNCIONES DE ASISTENCIA (Helpers) ---

const processBibEntry = (entry) => {
    const tags = entry.entryTags;
    const booktitle = normalizeAccents(tags.booktitle || '');
    const year = parseInt(tags.year);
    const isWorkshop = booktitle.toLowerCase().includes('workshop') || booktitle.toLowerCase().includes(' ws ');
    const entryType = entry.entryType.toLowerCase();
    const journal = normalizeAccents(tags.journal || '');
    const publisher = tags.publisher || '';
    const isNational = tags.scope === 'national' || '';
    const publicationType = getEntryType(entryType, journal, booktitle, isNational, isWorkshop, publisher);
    const authors = getAuthors(tags.author || '');
    
    return {
        type: publicationType,
        authors: authors,
        pubtitle: normalizeAccents(tags.title) || '',
        journal: journal,
        booktitle: booktitle,
        acronym: entryType === 'book' ? 'Book' : (entryType === 'phdthesis' ? 'PhD Thesis' : (publicationType === 'dataArtifacts' ? publisher : getAcronymOrTruncate(journal || booktitle || '', 25))),
        doi: formatDoiUrl(tags.doi || tags.url || ''),
        year: year,
        month: tags.month?.charAt(0).toUpperCase() + tags.month?.slice(1) || null,
        date: tags.month && year ? `${year}-${getMonthNumber(tags.month)}-01` : `${year}-01-01`,
        publisher: normalizeAccents(publisher) || null,
        abstract: tags.abstract || '',
        keywords: tags.keywords ? tags.keywords.split(',').map(k => k.trim()).join(', ') : '',
        address: tags.address || '',
        volume: tags.volume || '',
        pages: tags.pages || '',
        bibtexContent: generateBibtex(entry),
    };
};


/**
 * Genera la ruta recta para un enlace. El offset se ignora porque es 0.
 */
function linkPath(source, target, offset) {
    const sx = source.x_coord;
    const sy = source.y_coord_final;
    const tx = target.x_coord;
    const ty = target.y_coord_final;
    return `M ${sx},${sy} L ${tx},${ty}`; 
}


// --- CLASE PRINCIPAL DEL GRÁFICO ---

class TimelineChart {
    
    constructor(selector, dataUrl, bibUrl) {
        this.svgElement = d3.select(selector);
        
        // Ancho visible y altura
        this.visibleWidth = parseInt(this.svgElement.attr("width")) - CONFIG.margin.left - CONFIG.margin.right;
        this.height = parseInt(this.svgElement.attr("height")) - CONFIG.margin.top - CONFIG.margin.bottom;
        
        // Ancho de cálculo expandido (para mayor separación horizontal)
        this.width = this.visibleWidth * CONFIG.WIDTH_MULTIPLIER; 

        // Ajuste el tamaño del SVG si el contenido es más ancho (para desplazamiento)
        this.svg = this.svgElement.append("g")
            .attr("transform", `translate(${CONFIG.margin.left},${CONFIG.margin.top})`);
        
        if (this.width > this.visibleWidth) {
             this.svgElement.attr("width", this.width + CONFIG.margin.left + CONFIG.margin.right);
        }
        
        this.dataUrl = dataUrl;
        this.bibUrl = bibUrl;
        
        this.nodesById = new Map();
        this.scales = {};
        this.data = {};
        this.categories = [];
        this.categoryYCoords = [];
    }

    /**
     * Carga el JSON del timeline y el contenido del .bib. 
     * El parseo del .bib se realiza en un Web Worker para evitar el bloqueo.
     */
    async loadAndProcessData() {
        
        // Generar una marca de tiempo única para evitar la caché
        const cacheBuster = `?v=${new Date().getTime()}`;

        // 1. Cargar el JSON del timeline y el texto del .bib de forma asíncrona
        const [timelineData, bibtexContent] = await Promise.all([
            d3.json(this.dataUrl), 
            d3.text(this.bibUrl + cacheBuster) 
        ]);

        this.data = timelineData;
        
        if (!this.data || !this.data.nodes || !this.data.links) {
            console.error("Error: Datos del timeline incompletos.");
            return false;
        }

        // 2. Ejecutar el parseo de BibTeX en el Web Worker
        const publicationsJSON = await this.parseBibtexInWorker(bibtexContent);

        // 3. Mapear y Enriquecer los datos (rápido)
        const bibMap = new Map();
        publicationsJSON.forEach(entry => {
            const key = entry.citationKey; 
            if (key) {
                bibMap.set(key, processBibEntry(entry));
            }
        });

        this.data.nodes.forEach(node => {
            const details = bibMap.get(node.id);
            if (details) {
                // *** SOLUCIÓN: Copia todas las propiedades de 'details' a 'node' ***
                Object.assign(node, details); 
                
                // El objeto 'node' ahora tiene authors, source, pub_type, doi,
                // y cualquier otro campo que viniera en 'details'.
                
            } else {
                console.warn(`Clave BibTeX no encontrada: ${node.id}`);
                //node.authors = node.source = node.pub_type = "Desconocido";
                // Si tienes otros campos esenciales que podrían faltar, inicialízalos aquí
                //node.doi = ""; 
            }
            node.citations = node.citations || 0; // Asegura que las citas estén definidas
            node.hierarchy = node.hierarchy && node.hierarchy.length > 0 ? node.hierarchy : ["Sin Categoría"];
            node.full_path = node.hierarchy.join(CONFIG.TEMP_PATH_DELIMITER);
        });

        // ... (Inicialización final de this.nodesById, scales, etc.)
        this.nodesById = new Map(this.data.nodes.map(d => [d.id, d]));
        this.categories.primary = Array.from(new Set(this.data.nodes.map(d => d.hierarchy[0]))).sort();
        this.categoryMap = new Map();
        this.categories.primary.forEach((cat, index) => this.categoryMap.set(cat, index + 1));
        this.data.nodes.forEach(node => {
            node.y_pos = this.categoryMap.get(node.hierarchy[0]);
        });
        
        return true;
    }

    /**
     * Crea un Web Worker para parsear el contenido BibTeX y espera su resultado.
     * @param {string} bibtexContent - El contenido de texto del archivo .bib.
     * @returns {Promise<Array<Object>>} Una promesa que se resuelve con el JSON de publicaciones.
     */
    parseBibtexInWorker(bibtexContent) {
        return new Promise((resolve, reject) => {
            try {
                // Instancia el worker con la ruta correcta. ¡Ajusta la ruta si es necesario!
                const bibtexWorker = new Worker('static/js/bibtex.worker.js');  

                bibtexWorker.onmessage = (e) => {
                    bibtexWorker.terminate(); // ¡Siempre termina el worker al finalizar!
                    if (e.data.status === 'success') {
                        resolve(e.data.data);
                    } else {
                        // Rechazar la promesa si el worker reporta un error de parseo
                        console.error('Error de parseo reportado por el Worker:', e.data.message);
                        reject(new Error(`Parseo BibTeX fallido: ${e.data.message}`));
                    }
                };

                bibtexWorker.onerror = (e) => {
                    bibtexWorker.terminate();
                    // Rechazar si hay un error de carga del worker
                    console.error('Error al cargar/ejecutar el Web Worker:', e);
                    reject(new Error("Error del Web Worker: No se pudo iniciar el parseo."));
                };
                
                // Envía el contenido del archivo al worker para que empiece el parseo
                bibtexWorker.postMessage(bibtexContent); 

            } catch (error) {
                // Captura errores si el navegador no soporta workers
                reject(new Error(`No se pudo iniciar el Web Worker: ${error.message}`));
            }
        });
    }

    calculateScales() {
        const minYear = d3.min(this.data.nodes, d => d.year);
        const maxYear = new Date().getFullYear();
        
        this.scales.y = d3.scalePoint()
            .domain(this.categories.primary.map(cat => this.categoryMap.get(cat)).sort(d3.ascending))
            .range([50, this.height - 50]);

        this.scales.x = d3.scaleLinear()
            .domain([minYear - 2, maxYear + 1])
            .range([0, this.width]); // Utiliza el ancho expandido

        this.scales.color = d3.scaleOrdinal()
            .domain(this.categories.primary)
            .range(d3.schemeCategory10);
            
        // 1. Obtener el dominio para las citas
        // Aseguramos que el mínimo sea 1 si no hay citas, para que la escala funcione.
        const minCitations = d3.min(this.data.nodes, d => d.citations || 0);
        const maxCitations = d3.max(this.data.nodes, d => d.citations || 0);

        // 2. Definir la escala de radio (usando raíz cuadrada para mejor visualización)
        this.scales.radius = d3.scaleSqrt()
            .domain([minCitations, maxCitations])
            // Rango: de 4px (mínimo) a 15px (máximo)
            .range([CONFIG.NODE_RADIUS, 15]); 
            
        this.categoryYCoords = this.categories.primary.map(cat => this.scales.y(this.categoryMap.get(cat)));
    }
    
    calculateNodePositions() {
        const { JITTER_AMOUNT, REPULSION_THRESHOLD, REPULSION_FORCE_FACTOR } = CONFIG;

        this.data.nodes.forEach(node => {
            node.x_coord = this.scales.x(node.year);
            node.y_coord = this.scales.y(node.y_pos); // Posición de la línea central
        });

        const nodesByYPos = d3.group(this.data.nodes, d => d.y_pos);

        nodesByYPos.forEach(nodeGroup => {
            const nodesByYear = d3.group(nodeGroup, d => d.year);
            
            nodesByYear.forEach(yearGroup => {
                
                // Jittering Condicional (solo si hay colisión temporal)
                if (yearGroup.length > 1) {
                    
                    // Cálculo del Baricentro
                    yearGroup.forEach(node => {
                        let neighborYSum = 0;
                        let neighborCount = 0;
                        this.data.links.forEach(link => {
                            const otherId = link.source === node.id ? link.target : link.target === node.id ? link.source : null;
                            const otherNode = this.nodesById.get(otherId);
                            if (otherNode) {
                                neighborYSum += otherNode.y_coord;
                                neighborCount++;
                            }
                        });
                        node.baricenter = neighborCount > 0 ? neighborYSum / neighborCount : node.y_coord;
                    });
                    
                    // Ordenación por Baricentro
                    yearGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
                    
                    // Aplicar Jittering
                    const total = yearGroup.length;
                    yearGroup.forEach((node, index) => {
                        node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
                    });
                } else {
                    // Si no hay colisión, jitter es CERO.
                    yearGroup[0].y_jitter = 0;
                }
            });

            // Calcular la Posición Vertical Final
            nodeGroup.forEach(node => {
                let finalY = node.y_coord + node.y_jitter;
                
                // Aplicar Repulsión a líneas de otras categorías (para que no crucen la línea)
                /*
                this.categoryYCoords.forEach(lineY => {
                    if (Math.abs(lineY - node.y_coord) > 1) { 
                        const diff = finalY - lineY;
                        if (Math.abs(diff) < REPULSION_THRESHOLD) {
                            const repulsion = REPULSION_FORCE_FACTOR * (REPULSION_THRESHOLD - Math.abs(diff));
                            finalY += (diff < 0) ? -repulsion : repulsion;
                        }
                    }
                });
                */
                node.y_coord_final = finalY;
            });
        });
    }

    calculateBoundingBoxes() {
        const boundingBoxes = new Map();
        const allUniquePrefixes = new Set();
        
        this.data.nodes.forEach(node => {
            let currentPathParts = [];
            node.hierarchy.forEach(part => {
                currentPathParts.push(part);
                allUniquePrefixes.add(currentPathParts.join(CONFIG.TEMP_PATH_DELIMITER));
            });
        });

        allUniquePrefixes.forEach(fullPath => {
            const pathParts = fullPath.split(CONFIG.TEMP_PATH_DELIMITER);
            const primaryCat = pathParts[0];
            const nodesInPrefix = this.data.nodes.filter(d => d.full_path.startsWith(fullPath));

            if (nodesInPrefix.length > 0) {
                const box = {
                    path: fullPath,
                    name: pathParts[pathParts.length - 1],
                    category: primaryCat,
                    level: pathParts.length,
                    x_min: d3.min(nodesInPrefix, d => d.x_coord) - CONFIG.BOX_PADDING,
                    x_max: d3.max(nodesInPrefix, d => d.x_coord) + CONFIG.BOX_PADDING,
                    y_min: d3.min(nodesInPrefix, d => d.y_coord_final) - CONFIG.BOX_PADDING,
                    y_max: d3.max(nodesInPrefix, d => d.y_coord_final) + CONFIG.BOX_PADDING
                };
                box.width = box.x_max - box.x_min;
                box.height = box.y_max - box.y_min;
                boundingBoxes.set(fullPath, box);
            }
        });
        this.boundingBoxes = boundingBoxes;
    }

    drawBackground() {
        const { scales, width, height, categoryMap, categories, boundingBoxes } = this;
        const backgroundGroup = this.svg.append("g").attr("class", "background");

        // A. Eje X
        backgroundGroup.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(scales.x).tickFormat(d3.format("d")).tickValues(d3.range(scales.x.domain()[0], scales.x.domain()[1], 5)))
            .selectAll("text").attr("class", "year-label");

        // B. Ramas de Categoría
        categories.primary.forEach(catName => {
            const y = scales.y(categoryMap.get(catName));
            backgroundGroup.append("line")
                .attr("x1", 0).attr("y1", y).attr("x2", width).attr("y2", y)
                .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
            backgroundGroup.append("text").attr("class", "category-label").attr("x", -10).attr("y", y)
                .attr("dy", "0.31em").attr("text-anchor", "end").style("font-weight", "bold").text(catName);
        });

        // C. Bounding Boxes (solo nivel > 1)
        const sortedBoxes = Array.from(boundingBoxes.values()).sort((a, b) => d3.ascending(a.level, b.level) || d3.ascending(a.path, b.path));
        sortedBoxes.forEach(box => {
            if (box.level === 1) { // Omitir la caja de la categoría principal
                return; 
            }
            
            if (box.width > 0 && box.height > 0) {
                backgroundGroup.append("rect")
                    .attr("x", box.x_min).attr("y", box.y_min).attr("width", box.width).attr("height", box.height)
                    .attr("fill", "none").attr("stroke", scales.color(box.category)).attr("stroke-dasharray", "5,3")
                    .attr("stroke-width", 1); 

                backgroundGroup.append("text")
                    .attr("x", box.x_min + box.width / 2).attr("y", box.y_min - 5).attr("text-anchor", "middle")
                    .style("font-size", "12px").style("font-style", "italic").style("fill", scales.color(box.category))
                    .text(box.name);
            }
        });
    }

    drawLinks() {
        const { data, nodesById, scales } = this;
        const validLinks = data.links.filter(d => nodesById.get(d.source) && nodesById.get(d.target));

        this.svg.append("g")
            .attr("class", "links")
            .selectAll("path")
            .data(validLinks)
            .join("path")
            .attr("class", "link")
            .attr("d", d => linkPath(this.nodesById.get(d.source), this.nodesById.get(d.target), CONFIG.DEVIATION_OFFSET))
            .attr("fill", "none")
            .attr("stroke", d => scales.color(this.nodesById.get(d.target).hierarchy[0]))
            .attr("stroke-width", 1.5);
    }

    drawNodes() {
        const { data, scales } = this;

        this.nodeGroup = this.svg.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", "node")
            .attr("transform", d => `translate(${d.x_coord}, ${d.y_coord_final})`);

        this.nodeGroup.append("circle")
            .attr("r", d => scales.radius(d.citations || 0)) // Radio basado en citas
            .attr("fill", d => scales.color(d.hierarchy[0]))
            // 1. EVENTO MOUSEOVER: Muestra y rellena el tooltip
            .on("mouseover", (event, d) => {
                // Genera el contenido HTML
                const tooltipContent = `
                    <div style="font-size: 14px;">
                        <strong>${d.longtitle || ''}</strong> (${d.year || ''})
                    </div>
                    ${d.description ? `<span class="historical-text">${d.description}</span>` : ''}
                `;
                
                // Muestra el tooltip con el contenido
                d3.select("#custom-tooltip")
                    .style("opacity", 1)
                    .html(tooltipContent);
            })
            
            // 2. EVENTO MOUSEMOVE: Posiciona el tooltip
            .on("mousemove", (event) => {
                // event.pageX y event.pageY dan la posición del cursor en la ventana
                d3.select("#custom-tooltip")
                    // Ajustamos el offset (+10px) para que no oculte el cursor
                    .style("left", (event.pageX + 15) + "px") 
                    .style("top", (event.pageY - 15) + "px"); 
            })
            
            // 3. EVENTO MOUSEOUT: Oculta el tooltip
            .on("mouseout", () => {
                d3.select("#custom-tooltip")
                    .style("opacity", 0);
            })
            // AÑADIR EL EVENTO CLICK AQUÍ
            .on("click", (event, d) => {
                // Previene que el evento se propague si fuera necesario
                event.stopPropagation(); 
                
                // Llamar al nuevo método del modal
                this.showPublicationModal(d);
            });
    }

    applyLabeling() {
        const { data, svg, width, height } = this;
        const { NODE_RADIUS, SEPARATION_PADDING, MAX_COLLISION_ITERATIONS, COLLISION_FORCE_STRENGTH } = CONFIG;
        
        const labelGroup = svg.append("g").attr("class", "labels");

        // NUEVO MARGEN POSITIVO (Espacio libre deseado: 2px)
        const LABEL_NODE_MARGIN = -10; 

        // 1. Preparar datos de etiquetas con posición inicial ajustada
        const labels = data.nodes.map(d => {
            
            // X inicial: centro del hito + radio + margen deseado
            const initialLabelX = d.x_coord + NODE_RADIUS + LABEL_NODE_MARGIN;
            
            return {
                id: d.id, nodeX: d.x_coord, nodeY: d.y_coord_final, text: `${d.title}`, data: d,
                x: initialLabelX, 
                y: d.y_coord_final, // Centro vertical inicial
                width: 0, height: 0,
            };
        });

        // 2. Dibujar y medir texto
        const textElements = labelGroup.selectAll("g.label-item")
            .data(labels)
            .join("g").attr("class", "label-item")
            .attr("transform", d => `translate(${d.x}, ${d.y})`);

        textElements.append("text")
            .attr("dx", 0)
            .attr("dy", "0.35em") 
            .style("text-anchor", "start")
            .style("font-size", "11px")
            .text(d => d.text);

        textElements.each(function(d) {
            const bbox = this.getBBox();
            d.width = bbox.width + 4; 
            d.height = bbox.height + 2; 
            
            // CÁLCULO DE POSICIÓN Y INICIAL FIJA (borde superior del texto)
            // Posición Y: centro - radio - margen deseado - altura del texto
            // Esto asegura que el borde inferior del texto esté a LABEL_NODE_MARGIN del borde superior del hito.
            d.y = d.nodeY - NODE_RADIUS - LABEL_NODE_MARGIN - d.height; 
        });

        // 3. Resolución de Colisiones (Ajustando la Fuerza de Atracción)
        for (let i = 0; i < MAX_COLLISION_ITERATIONS; i++) {
            let moved = false;
            labels.forEach((l1) => {
                // ... (Lógica de detección de colisión y movimiento sin cambios) ...
                
                // CÁLCULO DINÁMICO DE LA POSICIÓN IDEAL (Punto de anclaje)
                // Ideal X: centro + radio + margen deseado
                const idealX = l1.nodeX + NODE_RADIUS + LABEL_NODE_MARGIN; 
                
                // Ideal Y: centro - radio - margen deseado - altura del texto (siempre arriba)
                const idealY = l1.nodeY - NODE_RADIUS - LABEL_NODE_MARGIN - l1.height;
                
                // Utilizamos las fuerzas de atracción ajustadas (0.1)
                l1.x += (idealX - l1.x) * 0.1; 
                l1.y += (idealY - l1.y) * 0.1; 
            });
            if (!moved && i > MAX_COLLISION_ITERATIONS / 2) break;
        }

        // 4. Actualizar posición de etiquetas
        textElements.attr("transform", d => `translate(${d.x}, ${d.y})`);
    }

    showPublicationModal(d) {
         // 1. Obtener la referencia del modal
        const myModal = new bootstrap.Modal(document.getElementById('publicationModal'));
        // Título princiapl
        document.getElementById('publicationModalLabel').textContent = d.longtitle || d.title || 'Milestone';
         // 2. Título secundario (Año entre paréntesis)
        const yearText = d.year ? `(${d.year})` : '';
        document.getElementById('publicationModalYear').textContent = yearText;

        // 2. Preparar el contenido
        const modalBody = d3.select("#publicationModal .modal-body");
        const categoryPath = d.hierarchy.join(' ➔ ');
        const concepts = d.concepts ? d.concepts.join(', ') : '';
        const urlValue = d.doi || d.url;
        const linkText = urlValue || '-';
        const textReference = `${d.authors}. ${d.title}.${d.journal || d.booktitle ? ` ${d.journal || d.booktitle},` : ''} ${d.year}. ${d.volume ? `${d.volume}:` : ''}${d.pages ? ` ${d.pages.replace(/--/, '-')}.` : ''}${d.address ? ` ${d.address}.` : ''} ${d.doi ? `${d.doi}` : d.url ? `${d.url}` : ''}${d.awards && d.awards.length > 0 ? ` ${d.awards.map(i => ` «${i}»`).join(', ')}` : ''}`;
        // 3. Rellenar el contenido HTML
        modalBody.html(`
            <div class="mb-3">
                <!-- <h6 class="text-secondary">Category: ${categoryPath || ''}</h6> -->
                ${d.description ? `<p><span class="historical-text">${d.description}</span></p>` : ''}
                ${categoryPath ? `<p><strong>Category:</strong> ${categoryPath}</p>` : ''}
                ${d.concepts ? `<p><strong>Main concepts:</strong> ${concepts}</p>` : ''}
                ${d.awards && d.awards.length > 0 ? `<p><strong>Awards:</strong> ${d.awards.map(i => ` «${i}»`).join(', ')}</p>` : ''}
            </div>

            <hr style="border-top: 2px solid; opacity: 1;"> 

            <div class="mt-3">
                <h6 class="text-secondary">Publication details:</h6>
                <!-- <p><strong>Type:</strong> ${typesMap[d.type]}</p> -->
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
                ${d.reference ? `<p><strong>Reference:</strong> ${d.reference}</p>` : ''}
                <div class="d-flex justify-content-center mt-3">
                    <button type="button" class="btn btn-outline-dark me-2" id="copyTextBtn">🏷️ Copy Reference</button>
                    <button type="button" class="btn btn-outline-dark" id="copyBibBtn">🗎 Copy BibTeX</button>
                </div>
            </div>
        `);

        // 4. Adjuntar Event Listeners a los botones (¡Deben estar dentro de la función!)
        // Nota: Asegúrate de que el campo 'bibtexContent' esté adjunto al nodo si quieres que funcione
        // (Actualmente, tu lógica de carga no adjunta el bibtexContent completo del hito al nodo)
        
        // A. Listener para Copiar Referencia
        document.getElementById("copyTextBtn").addEventListener("click", () => {
            navigator.clipboard.writeText(textReference)
                .then(() => alert("Referencia copiada al portapapeles!"))
                .catch(err => console.error("Fallo al copiar texto: ", err));
        });

        // B. Listener para Copiar BibTeX
        document.getElementById("copyBibBtn").addEventListener("click", () => {
            // Nota: d.bibtexContent debe ser la cadena BibTeX completa para ese hito.
            // Si no la has guardado, esto no funcionará.
            navigator.clipboard.writeText(d.bibtexContent || "Contenido BibTeX no disponible")
                .then(() => alert("BibTeX copiado al portapapeles!"))
                .catch(err => console.error("Fallo al copiar BibTeX: ", err));
        });
        
        // 5. Mostrar el modal
        myModal.show();
    }
    
    /**
     * Actualiza el número de citas de los nodos y redibuja la visualización.
     * @param {Map<string, number>} newCitationsMap - Mapa de (DOI o ID -> número de citas).
     */
    updateAndRedrawCitations(newCitationsMap) {
        if (!newCitationsMap || !(newCitationsMap instanceof Map)) {
            console.error("La función requiere un Map de {id: citas}.");
            return;
        }

        console.log("Aplicando nuevas citas y redibujando...");
        let updatedCount = 0;

        // 1. Actualizar el modelo de datos
        this.data.nodes.forEach(node => {
            // Se puede buscar por ID o por DOI (si la clave del mapa es el DOI)
            const newCitations = newCitationsMap.get(node.id) || newCitationsMap.get(node.doi);
            
            if (newCitations !== undefined && newCitations !== null) {
                if (node.citations !== newCitations) {
                    node.citations = newCitations;
                    updatedCount++;
                }
            }
        });

        // 2. Recalcular y Redibujar
        if (updatedCount > 0) {
            this.calculateScales(); // Recalcula la escala de radio con los nuevos valores min/max
            
            // Redibujar solo los nodos (círculos) con una transición suave
            this.svg.select(".nodes") 
                .selectAll("circle")
                .data(this.data.nodes)
                .transition().duration(800)
                .attr("r", d => this.scales.radius(d.citations || 0));

            console.log(`✅ Se actualizaron ${updatedCount} nodos. El tamaño de los círculos ha cambiado.`);
        } else {
            console.log("No se encontraron cambios en las citas para redibujar.");
        }
    }

    // --- FUNCIÓN DE EJECUCIÓN PÚBLICA ---
    async render() {
        const dataLoaded = await this.loadAndProcessData();
        if (!dataLoaded) return;

        this.calculateScales();
        this.calculateNodePositions();
        this.calculateBoundingBoxes();

        this.drawBackground();
        this.drawLinks();
        this.drawNodes();
        this.applyLabeling();
    }
}

// --- FUNCIÓN DE INICIALIZACIÓN (Punto de entrada) ---
function initTimeline() {
    const chart = new TimelineChart(
        "#timeline-svg", 
        "static/data/timeline_data.json", // 1. Ruta del JSON principal
        "static/data/publications.bib"   // 2. Ruta del archivo BibTeX
    );
    chart.render();
}

// Iniciar la carga de datos
document.addEventListener('DOMContentLoaded', () => {
    initTimeline();
});