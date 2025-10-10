// --- timeline.js (Módulo Principal) ---

// CONFIGURACIÓN GLOBAL ESTÁTICA
const CONFIG = {
    margin: { top: 50, right: 30, bottom: 50, left: 200 },
    JITTER_AMOUNT: 50, // REDUCIDO: Menos dispersión, más cerca de la línea central.
    BOX_PADDING: 15,
    TEMP_PATH_DELIMITER: '|',
    SEPARATION_PADDING: 5,
    NODE_RADIUS: 4, 
    REPULSION_THRESHOLD: 8,
    REPULSION_FORCE_FACTOR: 0.5,
    DEVIATION_OFFSET: 0, // SOLICITADO: Enlaces rectos
    MAX_COLLISION_ITERATIONS: 200,
    COLLISION_FORCE_STRENGTH: 0.5,
    WIDTH_MULTIPLIER: 1.8, 
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
 * Genera la ruta curva (Bézier cuadrática) para un enlace.
 */
function linkPath(source, target, offset) {
    const sx = source.x_coord;
    const sy = source.y_coord_final;
    const tx = target.x_coord;
    const ty = target.y_coord_final;
    
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    
    // Punto de control desviado
    const CP_Y = my + offset;
    
    return `M ${sx},${sy} Q ${mx},${CP_Y} ${tx},${ty}`;
}


// --- CLASE PRINCIPAL DEL GRÁFICO ---

class TimelineChart {
    
    constructor(selector, dataUrl) {
        this.svgElement = d3.select(selector);
        // Calcula el ancho visible del SVG
        this.visibleWidth = parseInt(this.svgElement.attr("width")) - CONFIG.margin.left - CONFIG.margin.right;
        this.height = parseInt(this.svgElement.attr("height")) - CONFIG.margin.top - CONFIG.margin.bottom;
        
        // Calcula el ancho expandido para la lógica del gráfico
        this.width = this.visibleWidth * CONFIG.WIDTH_MULTIPLIER; 

        // Asegúrate de que el contenedor SVG puede manejar este ancho (o que el div padre tiene scroll)
        this.svg = this.svgElement.append("g")
            .attr("transform", `translate(${CONFIG.margin.left},${CONFIG.margin.top})`);
        
        // Si el ancho calculado es mayor que el ancho visible, ajustamos el ancho del SVG
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
        // 1. Carga de datos
        this.data = await d3.json(this.dataUrl);
        
        if (!this.data || !this.data.nodes || !this.data.links) {
            console.error("Error: Datos incompletos.");
            this.svg.append("text").attr("x", this.width / 2).attr("y", this.height / 2).text("ERROR al cargar los datos.");
            return false;
        }

        // 2. Fusión de datos y preparación de Jerarquía
        this.data.nodes.forEach(node => {
            const details = getBibDetails(node.bib_key);
            node.authors = details.authors;
            node.source = details.source;
            node.hierarchy = node.hierarchy && node.hierarchy.length > 0 ? node.hierarchy : ["Sin Categoría"];
            node.full_path = node.hierarchy.join(CONFIG.TEMP_PATH_DELIMITER);
        });

        this.nodesById = new Map(this.data.nodes.map(d => [d.id, d]));
        
        // 3. Asignación de Posición Y
        this.categories.primary = Array.from(new Set(this.data.nodes.map(d => d.hierarchy[0]))).sort();
        this.categoryMap = new Map();
        this.categories.primary.forEach((cat, index) => this.categoryMap.set(cat, index + 1));
        
        this.data.nodes.forEach(node => {
            node.y_pos = this.categoryMap.get(node.hierarchy[0]);
        });
        
        return true;
    }

    calculateScales() {
        // 4. CÁLCULO DE ESCALAS
        const minYear = d3.min(this.data.nodes, d => d.year);
        const maxYear = new Date().getFullYear();
        
        this.scales.y = d3.scalePoint()
            .domain(this.categories.primary.map(cat => this.categoryMap.get(cat)).sort(d3.ascending))
            .range([50, this.height - 50]);

        this.scales.x = d3.scaleLinear()
            .domain([minYear - 2, maxYear + 1])
            .range([0, this.width]); // Se usa el 'this.width' expandido

        this.scales.color = d3.scaleOrdinal()
            .domain(this.categories.primary)
            .range(d3.schemeCategory10);
            
        this.categoryYCoords = this.categories.primary.map(cat => this.scales.y(this.categoryMap.get(cat)));
    }
    
    calculateNodePositions() {
        // 5. CÁLCULO DE JITTERING Y POSICIONES FINALES
        const { JITTER_AMOUNT, REPULSION_THRESHOLD, REPULSION_FORCE_FACTOR } = CONFIG;

        this.data.nodes.forEach(node => {
            node.x_coord = this.scales.x(node.year);
            node.y_coord = this.scales.y(node.y_pos);
        });

        // 1. Agrupación inicial por Categoría (y_pos)
        const nodesByYPos = d3.group(this.data.nodes, d => d.y_pos);

        nodesByYPos.forEach(nodeGroup => {
            
            // 2. Sub-Agrupación por Año para Jittering Condicional
            const nodesByYear = d3.group(nodeGroup, d => d.year);
            
            nodesByYear.forEach(yearGroup => {
                
                // 3. Jittering y Baricentro solo si hay colisión temporal (más de 1 nodo en el mismo año)
                if (yearGroup.length > 1) {
                    
                    // 3.1. Cálculo del Baricentro
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
                    
                    // 3.2. Ordenación por Baricentro para minimizar cruces
                    yearGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
                    
                    // 3.3. Aplicar Jittering (Dispersión)
                    const total = yearGroup.length;
                    yearGroup.forEach((node, index) => {
                        // Aplica Jittering
                        node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
                    });
                } else {
                    // Si solo hay un nodo en ese año, su jitter es CERO.
                    yearGroup[0].y_jitter = 0;
                }
            });

            // 4. Calcular la Posición Vertical Final (aplicado a todos los nodos del grupo de categoría)
            nodeGroup.forEach(node => {
                let finalY = node.y_coord + node.y_jitter;
                
                // Aplicar Repulsión a líneas de otras categorías (sigue igual)
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
        // 6. CÁLCULO DE LÍMITES DE LAS CAJAS
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
        // DIBUJO: Ejes, Ramas y Bounding Boxes
        const { scales, width, height, categoryMap, categories, boundingBoxes } = this;
        const backgroundGroup = this.svg.append("g").attr("class", "background");

       // A. Eje X
        backgroundGroup.append("g")
            .attr("transform", `translate(0,${this.height})`)
            .call(d3.axisBottom(this.scales.x).tickFormat(d3.format("d")).tickValues(d3.range(this.scales.x.domain()[0], this.scales.x.domain()[1], 5)))
            .selectAll("text").attr("class", "year-label");

        // B. Ramas de Categoría - La línea horizontal debe ir hasta el nuevo ancho
        this.categories.primary.forEach(catName => {
            const y = this.scales.y(this.categoryMap.get(catName));
            backgroundGroup.append("line")
                .attr("x1", 0).attr("y1", y)
                .attr("x2", this.width) // Ajustado para el ancho extendido
                .attr("y2", y)
                .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
            backgroundGroup.append("text").attr("class", "category-label").attr("x", -10).attr("y", y)
                .attr("dy", "0.31em").attr("text-anchor", "end").style("font-weight", "bold").text(catName);
        });

        // C. Bounding Boxes
        const sortedBoxes = Array.from(boundingBoxes.values()).sort((a, b) => d3.ascending(a.level, b.level) || d3.ascending(a.path, b.path));
        
        sortedBoxes.forEach(box => {
            // REQUISITO 1: Omitir el dibujo del rectángulo si es una categoría principal (nivel 1)
            if (box.level === 1) {
                return; 
            }
            
            if (box.width > 0 && box.height > 0) {
                backgroundGroup.append("rect")
                    .attr("x", box.x_min).attr("y", box.y_min).attr("width", box.width).attr("height", box.height)
                    .attr("fill", "none").attr("stroke", scales.color(box.category)).attr("stroke-dasharray", "5,3")
                    .attr("stroke-width", 1); // El nivel 1 es ahora el mínimo nivel dibujado

                backgroundGroup.append("text")
                    .attr("x", box.x_min + box.width / 2).attr("y", box.y_min - 5).attr("text-anchor", "middle")
                    .style("font-size", "12px").style("font-style", "italic").style("fill", scales.color(box.category))
                    .text(box.name);
            }
        });
    }

    drawLinks() {
        // DIBUJO: Enlaces Curvos
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
        // DIBUJO: Nodos/Hitos
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
            
        // Tooltip
        this.nodeGroup.append("title")
            .text(d => `${d.title} (${d.year})\nDescripción: ${d.description} \nAutores: ${d.authors} \nFuente: ${d.source} \nRama: ${d.hierarchy.join(' ➔ ')}`);
    }

    applyLabeling() {
        // DIBUJO: Etiquetas sin Conectores
        const { data, svg, width, height } = this;
        const { NODE_RADIUS, SEPARATION_PADDING, MAX_COLLISION_ITERATIONS, COLLISION_FORCE_STRENGTH } = CONFIG;
        
        const labelGroup = svg.append("g").attr("class", "labels");

        // DEFINICIÓN DEL MARGEN FINAL
        const textNodeMargin = -10; // Valor solicitado para superposición

        // 1. Preparar datos de etiquetas con posición inicial ajustada
        const labels = data.nodes.map(d => {
            // CORRECCIÓN: Usar d.y_coord (posición de la línea central)
            const isBelowLine = d.y_coord_final > d.y_coord; 
            const initialLabelX = d.x_coord + NODE_RADIUS + textNodeMargin;
            const initialLabelY = d.y_coord_final; // Centro vertical

            // NOTA: Asumiendo que has ajustado el formato del texto en tu código local a solo d.title
            return {
                id: d.id, nodeX: d.x_coord, nodeY: d.y_coord_final, text: `${d.title}`, data: d,
                x: initialLabelX, 
                y: initialLabelY, 
                width: 0, height: 0,
                isBelowLine: isBelowLine,
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
            
            // CÁLCULO DE POSICIÓN Y INICIAL (borde superior del texto)
            if (d.isBelowLine) {
                // Texto ABAJO: el borde superior del texto empieza después del radio + margen.
                d.y = d.nodeY + NODE_RADIUS + textNodeMargin;
            } else {
                // Texto ARRIBA: el borde superior del texto debe comenzar:
                // centro - radio - margen - altura del texto.
                d.y = d.nodeY - NODE_RADIUS - textNodeMargin - d.height; 
            }
        });

        // 3. Resolución de Colisiones (Ajustando la Fuerza de Atracción)
        for (let i = 0; i < MAX_COLLISION_ITERATIONS; i++) {
            let moved = false;
            labels.forEach((l1) => {
                labels.forEach((l2) => {
                    if (l1.id === l2.id) return;
                    const r1 = { x: l1.x, y: l1.y, width: l1.width, height: l1.height };
                    const r2 = { x: l2.x, y: l2.y, width: l2.width, height: l2.height };

                    // Detección de colisión (AABB)
                    if (r1.x < r2.x + r2.width + SEPARATION_PADDING && r1.x + r1.width + SEPARATION_PADDING > r2.x &&
                        r1.y < r2.y + r2.height + SEPARATION_PADDING && r1.y + r1.height + SEPARATION_PADDING > r2.y) {
                        
                        const overlapX = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
                        const overlapY = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));

                        if (overlapX > 0 && overlapY > 0) {
                            if (overlapX < overlapY) { // Mover horizontalmente
                                l2.x += (l1.x < l2.x ? 1 : -1) * overlapX / 2 * COLLISION_FORCE_STRENGTH;
                            } else { // Mover verticalmente
                                l2.y += (l1.y < l2.y ? 1 : -1) * overlapY / 2 * COLLISION_FORCE_STRENGTH;
                            }
                            moved = true;
                        }
                    }
                });

                // Restricción al SVG y Fuerza de Atracción
                l1.x = Math.max(0, Math.min(width - l1.width, l1.x));
                l1.y = Math.max(0, Math.min(height - l1.height, l1.y));
                
                // CÁLCULO DINÁMICO DE LA POSICIÓN IDEAL (Punto de anclaje)
                const idealX = l1.nodeX + NODE_RADIUS + textNodeMargin; 
                let idealY;

                if (l1.isBelowLine) {
                    idealY = l1.nodeY + NODE_RADIUS + textNodeMargin;
                } else {
                    idealY = l1.nodeY - NODE_RADIUS - textNodeMargin - l1.height;
                }
                
                l1.x += (idealX - l1.x) * 0.05; 
                l1.y += (idealY - l1.y) * 0.05; 
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

        // Orden de dibujo para el Z-order (fondo a frente)
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