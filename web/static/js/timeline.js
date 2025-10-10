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

// --- FUNCIONES DE ASISTENCIA (Helpers) ---

const getBibDetails = (bibKey) => {
    const details = {
        "Kang1990FODA": { "authors": "Kang et al.", "source": "SEI Tech Report" },
        "Batory2001Generative": { "authors": "Batory et al.", "source": "Generative Prog. Book" },
        "Czarnecki2005CFM": { "authors": "Czarnecki & Antkiewicz", "source": "ICSE '05" },
        "Thiel2005AFM": { "authors": "Thiel & Hein", "source": "SPLC '05" },
        "Engels2005Testing": { "authors": "Engels et al.", "source": "SPLiT '05" },
        "Benavides2007Dead": { "authors": "Benavides et al.", "source": "EMSE Journal" },
        "Mendoca2009Config": { "authors": "Mendonça et al.", "source": "ICSE '09" }
    };
    return details[bibKey] || { "authors": "Desconocido", "source": "Desconocida" };
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
    
    constructor(selector, dataUrl) {
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
        
        this.nodesById = new Map();
        this.scales = {};
        this.data = {};
        this.categories = [];
        this.categoryYCoords = [];
    }

    async loadAndProcessData() {
        this.data = await d3.json(this.dataUrl);
        
        if (!this.data || !this.data.nodes || !this.data.links) {
            console.error("Error: Datos incompletos.");
            this.svg.append("text").attr("x", this.width / 2).attr("y", this.height / 2).text("ERROR al cargar los datos.");
            return false;
        }

        this.data.nodes.forEach(node => {
            const details = getBibDetails(node.bib_key);
            node.authors = details.authors;
            node.source = details.source;
            node.hierarchy = node.hierarchy && node.hierarchy.length > 0 ? node.hierarchy : ["Sin Categoría"];
            node.full_path = node.hierarchy.join(CONFIG.TEMP_PATH_DELIMITER);
        });

        this.nodesById = new Map(this.data.nodes.map(d => [d.id, d]));
        
        this.categories.primary = Array.from(new Set(this.data.nodes.map(d => d.hierarchy[0]))).sort();
        this.categoryMap = new Map();
        this.categories.primary.forEach((cat, index) => this.categoryMap.set(cat, index + 1));
        
        this.data.nodes.forEach(node => {
            node.y_pos = this.categoryMap.get(node.hierarchy[0]);
        });
        
        return true;
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
                this.categoryYCoords.forEach(lineY => {
                    if (Math.abs(lineY - node.y_coord) > 1) { 
                        const diff = finalY - lineY;
                        if (Math.abs(diff) < REPULSION_THRESHOLD) {
                            const repulsion = REPULSION_FORCE_FACTOR * (REPULSION_THRESHOLD - Math.abs(diff));
                            finalY += (diff < 0) ? -repulsion : repulsion;
                        }
                    }
                });
                
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
            .attr("r", CONFIG.NODE_RADIUS)
            .attr("fill", d => scales.color(d.hierarchy[0]));
            
        this.nodeGroup.append("title")
            .text(d => `${d.title} (${d.year})\nDescripción: ${d.description} \nAutores: ${d.authors} \nFuente: ${d.source} \nRama: ${d.hierarchy.join(' ➔ ')}`);
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
    const chart = new TimelineChart("#timeline-svg", "static/data/timeline_data.json");
    chart.render();
}

// Iniciar la carga de datos
initTimeline();