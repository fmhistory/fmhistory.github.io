// CONFIGURACIÓN GLOBAL
const margin = { top: 50, right: 30, bottom: 50, left: 200 };
const svgElement = d3.select("#timeline-svg");
const width = parseInt(svgElement.attr("width")) - margin.left - margin.right;
const height = parseInt(svgElement.attr("height")) - margin.top - margin.bottom;

const svg = svgElement.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const JITTER_AMOUNT = 15;
const BOX_PADDING = 15;
const TEMP_PATH_DELIMITER = '|';
const SEPARATION_PADDING = 5; 
const NODE_RADIUS = 6; 

let yPosScale, xScale, colorScale;

// --- FUNCIONES DE ASISTENCIA ---

// Función stub para obtener los detalles de la referencia BibTeX
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


// --- FUNCIÓN PRINCIPAL DE DIBUJO ---

async function loadData() {
    
    // 1. CARGA DE DATOS Y VALIDACIÓN
    const data = await d3.json("static/data/timeline_data.json");
    
    if (!data || !data.nodes || !data.links) {
        console.error("Error: Los datos no se cargaron correctamente o les faltan las propiedades 'nodes'/'links'.");
        svg.append("text")
           .attr("x", width / 2)
           .attr("y", height / 2)
           .attr("text-anchor", "middle")
           .style("fill", "red")
           .text("ERROR: No se pudo cargar o validar el archivo de datos.");
        return; 
    }
    
    // 2. FUSIÓN DE DATOS (Añadir detalles BibTeX y Preparar Path Interno)
    data.nodes.forEach(node => {
        const details = getBibDetails(node.bib_key);
        node.authors = details.authors;
        node.source = details.source;
        
        if (!node.hierarchy || node.hierarchy.length === 0) {
            node.hierarchy = ["Sin Categoría"];
        }
        node.description = node.description || 'N/A';
    });
    
    // NOTA: Necesitamos acceso rápido a los nodos por ID para la heurística de cruces.
    const nodesById = new Map(data.nodes.map(d => [d.id, d]));

    // 3. ASIGNACIÓN AUTOMÁTICA DE POSICIÓN Y Y PREPARACIÓN DE BOUNDING BOXES
    const primaryCategories = Array.from(new Set(data.nodes.map(d => d.hierarchy[0]))).sort();
    
    const categoryMap = new Map();
    primaryCategories.forEach((cat, index) => {
        categoryMap.set(cat, index + 1); 
    });

    data.nodes.forEach(node => {
        const primaryCat = node.hierarchy[0];
        node.y_pos = categoryMap.get(primaryCat);
        node.full_path = node.hierarchy.join(TEMP_PATH_DELIMITER); 
    });


    // 4. CÁLCULO DE ESCALAS
    yPosScale = d3.scalePoint()
        .domain(primaryCategories.map(cat => categoryMap.get(cat)).sort(d3.ascending))
        .range([50, height - 50]); 

    const minYear = d3.min(data.nodes, d => d.year);
    const maxYear = new Date().getFullYear(); 
    xScale = d3.scaleLinear()
        .domain([minYear - 2, maxYear + 1])
        .range([0, width]);

    const colorDomain = primaryCategories;
    colorScale = d3.scaleOrdinal()
        .domain(colorDomain)
        .range(d3.schemeCategory10);
    
    // 5. CÁLCULO DE JITTERING CON OPTIMIZACIÓN DE CRUCES
    
    // 5.1. Pre-cálculo de la posición X de los nodos
    data.nodes.forEach(node => {
        node.x_coord = xScale(node.year);
        // Inicialmente y_coord solo tiene la posición base Y (sin jittering)
        node.y_coord = yPosScale(node.y_pos); 
    });
    
    // 5.2. Heurística de la Posición del Baricentro
    // Agrupamos hitos por su línea base Y (y_pos) para ordenarlos por el promedio de sus vecinos.
    const nodesByYPos = d3.group(data.nodes, d => d.y_pos);

    nodesByYPos.forEach(nodeGroup => {
        
        // 1. Calcular el "Baricentro" (posición Y promedio de sus vecinos) para cada nodo
        nodeGroup.forEach(node => {
            let neighborYSum = 0;
            let neighborCount = 0;
            
            // Buscar vecinos de origen (source) y destino (target)
            data.links.forEach(link => {
                if (link.source === node.id) {
                    const targetNode = nodesById.get(link.target);
                    if (targetNode) {
                        neighborYSum += targetNode.y_coord; // Usamos la posición Y sin jittering
                        neighborCount++;
                    }
                } else if (link.target === node.id) {
                    const sourceNode = nodesById.get(link.source);
                    if (sourceNode) {
                        neighborYSum += sourceNode.y_coord; // Usamos la posición Y sin jittering
                        neighborCount++;
                    }
                }
            });
            
            // Asignar el baricentro (o la posición actual si no hay vecinos)
            node.baricenter = neighborCount > 0 ? neighborYSum / neighborCount : node.y_coord;
        });
        
        // 2. Ordenar el grupo de nodos por el valor del baricentro (esto minimiza los cruces)
        nodeGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
        
        // 3. Aplicar Jittering (desplazamiento vertical) basado en el nuevo orden
        const total = nodeGroup.length;
        nodeGroup.forEach((node, index) => {
            // Calcula el jittering para separar hitos
            node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
            // Actualiza la posición Y final
            node.y_coord_final = node.y_coord + node.y_jitter;
        });
    });
    
    // Los datos están ahora ordenados y tienen 'y_jitter' y 'y_coord_final' asignados.
    
    
    // 6. CÁLCULO FINAL DE LÍMITES DE LAS CAJAS (Bounding Boxes)
    // ... (El cálculo de las cajas necesita usar 'y_coord_final' para los límites) ...
    const boundingBoxes = new Map(); 
    const allUniquePrefixes = new Set(); 

    data.nodes.forEach(node => {
        let currentPathParts = [];
        node.hierarchy.forEach(part => {
            currentPathParts.push(part);
            const currentPath = currentPathParts.join(TEMP_PATH_DELIMITER);
            allUniquePrefixes.add(currentPath);
        });
    });

    allUniquePrefixes.forEach(fullPath => {
        const pathParts = fullPath.split(TEMP_PATH_DELIMITER);
        const primaryCat = pathParts[0];
        const nodesInPrefix = data.nodes.filter(d => d.full_path.startsWith(fullPath));

        if (nodesInPrefix.length > 0) {
            
            const box = {
                path: fullPath,
                name: pathParts[pathParts.length - 1],
                category: primaryCat,
                level: pathParts.length, 
                
                // **USO DE y_coord_final:** Usar la posición Y final (con jittering)
                x_min: d3.min(nodesInPrefix, d => d.x_coord) - BOX_PADDING,
                x_max: d3.max(nodesInPrefix, d => d.x_coord) + BOX_PADDING,
                y_min: d3.min(nodesInPrefix, d => d.y_coord_final) - BOX_PADDING,
                y_max: d3.max(nodesInPrefix, d => d.y_coord_final) + BOX_PADDING
            };
            box.width = box.x_max - box.x_min;
            box.height = box.y_max - box.y_min;
            
            boundingBoxes.set(fullPath, box);
        }
    });


    // --- DIBUJO ---
    
    // A. Eje X (Permanece igual)
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).tickValues(d3.range(minYear, maxYear + 1, 5)))
        .selectAll("text")
        .attr("class", "year-label");

    // B. Ramas y Bounding Boxes (Permanece igual, usando las coordenadas calculadas)
    // ... (Sección B del código anterior) ...
    primaryCategories.forEach(catName => {
        const y = yPosScale(categoryMap.get(catName));
        
        svg.append("line")
            .attr("x1", 0).attr("y1", y)
            .attr("x2", width).attr("y2", y)
            .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
            
        svg.append("text")
            .attr("class", "category-label")
            .attr("x", -10).attr("y", y)
            .attr("dy", "0.31em").attr("text-anchor", "end")
            .style("font-weight", "bold")
            .text(catName); 
    });

    const sortedBoxes = Array.from(boundingBoxes.values()).sort((a, b) => {
        const levelOrder = d3.ascending(a.level, b.level);
        if (levelOrder !== 0) return levelOrder;
        return d3.ascending(a.path, b.path);
    });

    sortedBoxes.forEach(box => {
        if (box.width > 0 && box.height > 0) { 
            
            svg.append("rect")
                .attr("x", box.x_min)
                .attr("y", box.y_min)
                .attr("width", box.width)
                .attr("height", box.height)
                .attr("fill", "none")
                .attr("stroke", colorScale(box.category))
                .attr("stroke-dasharray", "5,3")
                .attr("stroke-width", box.level === 1 ? 2 : 1); 

            svg.append("text")
                .attr("x", box.x_min + box.width / 2) 
                .attr("y", box.y_min - 5) 
                .attr("text-anchor", "middle")
                .style("font-size", "12px")
                .style("font-style", "italic")
                .style("fill", colorScale(box.category))
                .text(box.name);
        }
    });

    // C. Enlaces (Links)
    // **USO DE y_coord_final:** Usar la posición Y final para los conectores
    const validLinks = data.links.filter(d => {
        return nodesById.get(d.source) !== undefined && nodesById.get(d.target) !== undefined;
    });

    svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(validLinks)
        .join("line")
        .attr("class", "link")
        .attr("x1", d => nodesById.get(d.source).x_coord)
        .attr("y1", d => nodesById.get(d.source).y_coord_final)
        .attr("x2", d => nodesById.get(d.target).x_coord)
        .attr("y2", d => nodesById.get(d.target).y_coord_final)
        .attr("stroke", d => colorScale(nodesById.get(d.target).hierarchy[0]));


    // D. Nodos (Nodes)
    // **USO DE y_coord_final:** Usar la posición Y final para los hitos
    const nodeGroup = svg.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x_coord}, ${d.y_coord_final})`);

    // Círculos de los hitos
    nodeGroup.append("circle")
        .attr("r", NODE_RADIUS)
        .attr("fill", d => colorScale(d.hierarchy[0]));


    // --- ALGORITMO DE ETIQUETADO INTELIGENTE (COLISIÓN) ---

    const labelGroup = svg.append("g").attr("class", "labels");
    const connectorGroup = svg.append("g").attr("class", "connectors");

    // 1. Preparar los datos de las etiquetas
    const labels = data.nodes.map(d => {
        const nodeX = d.x_coord;
        const nodeY = d.y_coord_final; // **USO DE y_coord_final**
        
        const text = `${d.title} (${d.year})`; 
        const initialY = nodeY - (NODE_RADIUS * 2); 

        return {
            id: d.id, nodeX: nodeX, nodeY: nodeY, text: text,
            x: nodeX + 10, y: initialY, width: 0, height: 0, data: d
        };
    });

    // 2. Dibujar las etiquetas de texto
    const textElements = labelGroup.selectAll("g.label-item")
        .data(labels)
        .join("g")
        .attr("class", "label-item")
        .attr("transform", d => `translate(${d.x}, ${d.y})`);

    textElements.append("text")
        .attr("dx", 0)
        .attr("dy", "0.35em")
        .style("text-anchor", "start")
        .style("font-size", "11px")
        .text(d => d.text);

    // 3. Calcular las dimensiones reales de cada etiqueta
    textElements.each(function(d) {
        const bbox = this.getBBox();
        d.width = bbox.width + 4; 
        d.height = bbox.height + 2; 
        
        d.x_rect_offset = 0; 
        d.y_rect_offset = 0; 
    });

    // 4. Implementar el algoritmo de resolución de colisiones (desplazamiento vertical)
    const MAX_ITERATIONS = 100;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        let moved = false;
        labels.forEach((l1, idx1) => {
            labels.forEach((l2, idx2) => {
                if (idx1 < idx2) {
                    if (l1.x < l2.x + l2.width &&
                        l1.x + l1.width > l2.x &&
                        l1.y < l2.y + l2.height &&
                        l1.y + l1.height > l2.y) {
                        
                        l2.y += (l1.y + l1.height - l2.y) + SEPARATION_PADDING;
                        moved = true;
                    }
                }
            });
        });
        if (!moved) break;
    }

    // 5. Actualizar la posición de las etiquetas
    textElements.attr("transform", d => `translate(${d.x}, ${d.y})`);

    // 6. Dibujar los conectores
    connectorGroup.selectAll("line.connector")
        .data(labels)
        .join("line")
        .attr("class", "connector")
        // Comienza en el borde derecho del círculo
        .attr("x1", d => d.nodeX + NODE_RADIUS) 
        .attr("y1", d => d.nodeY)
        // Termina en el inicio del texto
        .attr("x2", d => d.x + d.x_rect_offset)
        .attr("y2", d => d.y + d.height / 2 + d.y_rect_offset) 
        .attr("stroke", "#888")
        .attr("stroke-width", 0.5);


    // Tooltip (adjunto al círculo)
    nodeGroup.append("title")
        .text(d => `${d.title} (${d.year})\nDescripción: ${d.description} \nAutores: ${d.authors} \nFuente: ${d.source} \nRama: ${d.hierarchy.join(' ➔ ')}`);
}

// Iniciar la carga de datos
loadData();