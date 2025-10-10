// --- timeline.js (Módulo Principal) ---

// CONFIGURACIÓN GLOBAL ESTÁTICA
const CONFIG = {
    margin: { top: 50, right: 30, bottom: 50, left: 200 },
    JITTER_AMOUNT: 15,
    BOX_PADDING: 15,
    TEMP_PATH_DELIMITER: '|',
    SEPARATION_PADDING: 5,
    NODE_RADIUS: 6,
    REPULSION_THRESHOLD: 8,
    REPULSION_FORCE_FACTOR: 0.5,
    DEVIATION_OFFSET: 30, // Offset para enlaces curvos
    MAX_COLLISION_ITERATIONS: 200,
    COLLISION_FORCE_STRENGTH: 0.5,
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
        // Inicialización de contenedores y dimensiones
        this.svgElement = d3.select(selector);
        this.width = parseInt(this.svgElement.attr("width")) - CONFIG.margin.left - CONFIG.margin.right;
        this.height = parseInt(this.svgElement.attr("height")) - CONFIG.margin.top - CONFIG.margin.bottom;

        this.svg = this.svgElement.append("g")
            .attr("transform", `translate(${CONFIG.margin.left},${CONFIG.margin.top})`);
        
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
            .range([0, this.width]);

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

        const nodesByYPos = d3.group(this.data.nodes, d => d.y_pos);

        nodesByYPos.forEach(nodeGroup => {
            // 5.1. Baricentro y ordenación
            nodeGroup.forEach(node => {
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
            
            nodeGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
            
            // 5.2. Aplicar Jittering y Repulsión
            const total = nodeGroup.length;
            nodeGroup.forEach((node, index) => {
                node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
                let finalY = node.y_coord + node.y_jitter;
                
                // Aplicar Repulsión a líneas de otras categorías
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

        // C. Bounding Boxes
        const sortedBoxes = Array.from(boundingBoxes.values()).sort((a, b) => d3.ascending(a.level, b.level) || d3.ascending(a.path, b.path));
        sortedBoxes.forEach(box => {
            if (box.width > 0 && box.height > 0) {
                backgroundGroup.append("rect")
                    .attr("x", box.x_min).attr("y", box.y_min).attr("width", box.width).attr("height", box.height)
                    .attr("fill", "none").attr("stroke", scales.color(box.category)).attr("stroke-dasharray", "5,3")
                    .attr("stroke-width", box.level === 1 ? 2 : 1);
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
        // DIBUJO: Etiquetas y Conectores con Colisión
        const { data, svg, width, height, nodeGroup, scales } = this;
        const { NODE_RADIUS, SEPARATION_PADDING, MAX_COLLISION_ITERATIONS, COLLISION_FORCE_STRENGTH } = CONFIG;
        
        const connectorGroup = svg.append("g").attr("class", "connectors");
        const labelGroup = svg.append("g").attr("class", "labels");

        // 1. Preparar datos de etiquetas
        const labels = data.nodes.map(d => ({
            id: d.id, nodeX: d.x_coord, nodeY: d.y_coord_final, text: `${d.title} (${d.year})`, data: d,
            x: d.x_coord + NODE_RADIUS + 10, y: d.y_coord_final, width: 0, height: 0,
        }));

        // 2. Dibujar y medir texto
        const textElements = labelGroup.selectAll("g.label-item")
            .data(labels)
            .join("g").attr("class", "label-item")
            .attr("transform", d => `translate(${d.x}, ${d.y})`);

        textElements.append("text")
            .attr("dx", 0).attr("dy", "0.35em").style("text-anchor", "start").style("font-size", "11px")
            .text(d => d.text);

        textElements.each(function(d) {
            const bbox = this.getBBox();
            d.width = bbox.width + 4; d.height = bbox.height + 2;
            d.y -= d.height / 2; // Ajustar Y para centrar verticalmente
        });

        // 3. Resolución de Colisiones
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
                const idealX = l1.nodeX + NODE_RADIUS + 10; 
                const idealY = l1.nodeY - l1.height / 2; 
                l1.x += (idealX - l1.x) * 0.05; 
                l1.y += (idealY - l1.y) * 0.05; 
            });
            if (!moved && i > MAX_COLLISION_ITERATIONS / 2) break;
        }

        // 4. Actualizar posición de etiquetas y dibujar conectores
        textElements.attr("transform", d => `translate(${d.x}, ${d.y})`);

        connectorGroup.selectAll("path.connector")
            .data(labels)
            .join("path")
            .attr("class", "connector")
            .attr("d", d => {
                const elbowY = d.y + d.height / 2; 
                let elbowX = d.x; 
                if (elbowX < d.nodeX + NODE_RADIUS + 5) { elbowX = d.nodeX + NODE_RADIUS + 5; }
                return `M ${d.nodeX + NODE_RADIUS} ${d.nodeY} L ${elbowX} ${d.nodeY} L ${elbowX} ${elbowY} L ${d.x} ${elbowY}`;
            })
            .attr("fill", "none").attr("stroke", "#888").attr("stroke-width", 0.5);
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