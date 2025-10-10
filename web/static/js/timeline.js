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
let nodesById; // Lo haremos global para facilitar el acceso en loadData

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

/**
 * Genera la ruta curva (Bézier) para un enlace, desviándose para no pasar sobre hitos.
 * @param {Object} d - Datos del enlace (source, target)
 * @param {number} offset - Distancia de desvío vertical.
 * @returns {string} - Cadena de path SVG.
 */
function linkPath(d, offset) {
    const source = nodesById.get(d.source);
    const target = nodesById.get(d.target);
    
    // Puntos de inicio y fin (S: Source, T: Target)
    const sx = source.x_coord;
    const sy = source.y_coord_final;
    const tx = target.x_coord;
    const ty = target.y_coord_final;
    
    // Punto medio del enlace
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    
    // El punto de control (CP) se desvía del punto medio MY, en la dirección perpendicular.
    // Usamos el 'offset' (una constante) para el desvío vertical (eje Y).
    // Si el enlace va de izquierda a derecha (sx < tx), el desvío es vertical.
    
    // Para simplificar, desviaremos el punto de control verticalmente.
    // Usaremos el offset para el desvío. El offset debe ser mayor que el JITTER_AMOUNT + NODE_RADIUS
    const CP_Y = my + offset;
    
    // C = Curva de Bézier cúbica
    // M sx,sy (mover a inicio)
    // S mx,CP_Y tx,ty (curva suave: punto de control en [mx, CP_Y], termina en [tx,ty])
    
    // Nota: Usamos una curva de Bézier cuadrática (Q) o cúbica suave (S).
    // Usaremos la curva cúbica suave (S) para un control más limpio y un solo punto de control.
    // S: refleja el punto de control anterior, así que usaremos Q (cuadrática).
    
    // Mover a inicio (M)
    // Curva cuadrática (Q) con un solo punto de control (mx, CP_Y) hasta el final (tx, ty)
    return `M ${sx},${sy} Q ${mx},${CP_Y} ${tx},${ty}`;
}


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
    
    nodesById = new Map(data.nodes.map(d => [d.id, d]));

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
    
    data.nodes.forEach(node => {
        node.x_coord = xScale(node.year);
        node.y_coord = yPosScale(node.y_pos); 
    });
    
    const nodesByYPos = d3.group(data.nodes, d => d.y_pos);

    nodesByYPos.forEach(nodeGroup => {
        nodeGroup.forEach(node => {
            let neighborYSum = 0;
            let neighborCount = 0;
            
            data.links.forEach(link => {
                const otherId = link.source === node.id ? link.target : link.target === node.id ? link.source : null;
                const otherNode = nodesById.get(otherId);
                if (otherNode) {
                    neighborYSum += otherNode.y_coord;
                    neighborCount++;
                }
            });
            
            node.baricenter = neighborCount > 0 ? neighborYSum / neighborCount : node.y_coord;
        });
        
        nodeGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
        
        const total = nodeGroup.length;
        nodeGroup.forEach((node, index) => {
            node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
            node.y_coord_final = node.y_coord + node.y_jitter;
        });
    });
    
    
    // 6. CÁLCULO FINAL DE LÍMITES DE LAS CAJAS (Bounding Boxes)
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
    
    // A. Eje X
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).tickValues(d3.range(minYear, maxYear + 1, 5)))
        .selectAll("text")
        .attr("class", "year-label");

    // B. Ramas y Bounding Boxes
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

    // C. Enlaces (Links) - ¡MODIFICADO A CURVAS!
    const validLinks = data.links.filter(d => {
        return nodesById.get(d.source) !== undefined && nodesById.get(d.target) !== undefined;
    });

    // Heurística de desvío: Distancia vertical para el punto de control de la curva
    const DEVIATION_OFFSET = 30; 
    
    svg.append("g")
        .attr("class", "links")
        .selectAll("path") // Cambiado de "line" a "path"
        .data(validLinks)
        .join("path")
        .attr("class", "link")
        .attr("d", d => linkPath(d, DEVIATION_OFFSET)) // Usamos la función linkPath
        .attr("fill", "none")
        .attr("stroke", d => colorScale(nodesById.get(d.target).hierarchy[0]))
        .attr("stroke-width", 1.5)
        .lower(); // Enviamos los enlaces al fondo para que no tapen hitos ni etiquetas


    // D. Nodos (Nodes)
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


    // --- ALGORITMO DE ETIQUETADO INTELIGENTE (COLISIÓN Y CODOS) ---

    const labelGroup = svg.append("g").attr("class", "labels");
    const connectorGroup = svg.append("g").attr("class", "connectors");

    // 1. Preparar los datos de las etiquetas
    const labels = data.nodes.map(d => {
        const nodeX = d.x_coord;
        const nodeY = d.y_coord_final;
        
        const text = `${d.title} (${d.year})`; 
        
        // Posición inicial del texto, intenta el lado derecho primero
        const initialLabelX = nodeX + NODE_RADIUS + 10; // 10px a la derecha del círculo
        const initialLabelY = nodeY; // Centrado con el hito
        
        return {
            id: d.id, 
            nodeX: nodeX, 
            nodeY: nodeY, 
            text: text,
            x: initialLabelX, 
            y: initialLabelY,      
            width: 0,      
            height: 0,     
            data: d,
            // Puntos para el conector en codo (inicialmente, se ajustarán)
            anchorX: nodeX + NODE_RADIUS, 
            anchorY: nodeY,
            elbowX: initialLabelX - 5, // Justo antes del texto
            elbowY: initialLabelY
        };
    });

    // 2. Dibujar las etiquetas de texto (sin rect de fondo)
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
        
        // Ajusta la 'y' inicial del texto para que el centro vertical del bbox esté en 'd.y'
        d.y -= d.height / 2;
        // Ajusta el 'elbowY' con la nueva 'y' para que el codo siga el texto
        d.elbowY = d.y + d.height / 2; 
    });

    // 4. Implementar el algoritmo de resolución de colisiones (desplazamiento vertical Y horizontal)
    const MAX_ITERATIONS = 200; 
    const FORCE_STRENGTH = 0.5; 

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        let moved = false;
        labels.forEach((l1) => {
            labels.forEach((l2) => {
                if (l1.id === l2.id) return;

                // Crear rectángulos para la detección de colisiones
                const r1 = { x: l1.x, y: l1.y, width: l1.width, height: l1.height };
                const r2 = { x: l2.x, y: l2.y, width: l2.width, height: l2.height };

                // Detección de colisión (AABB) con padding
                if (r1.x < r2.x + r2.width + SEPARATION_PADDING &&
                    r1.x + r1.width + SEPARATION_PADDING > r2.x &&
                    r1.y < r2.y + r2.height + SEPARATION_PADDING &&
                    r1.y + r1.height + SEPARATION_PADDING > r2.y) {
                    
                    // Resolución: Calcular el vector de "empuje"
                    const overlapX = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
                    const overlapY = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));

                    if (overlapX > 0 && overlapY > 0) {
                        if (overlapX < overlapY) { // Mover horizontalmente
                            if (l1.x < l2.x) { 
                                l2.x += overlapX / 2 * FORCE_STRENGTH;
                            } else {
                                l2.x -= overlapX / 2 * FORCE_STRENGTH;
                            }
                        } else { // Mover verticalmente
                            if (l1.y < l2.y) { 
                                l2.y += overlapY / 2 * FORCE_STRENGTH;
                            } else {
                                l2.y -= overlapY / 2 * FORCE_STRENGTH;
                            }
                        }
                        moved = true;
                    }
                }
            });

            // Restricción al SVG
            l1.x = Math.max(0, Math.min(width - l1.width, l1.x));
            l1.y = Math.max(0, Math.min(height - l1.height, l1.y));

            // Fuerza de Atracción (mantener cerca del hito)
            const idealX = l1.nodeX + NODE_RADIUS + 10; 
            const idealY = l1.nodeY - l1.height / 2; 
            
            l1.x += (idealX - l1.x) * 0.05; 
            l1.y += (idealY - l1.y) * 0.05; 

        });
        if (!moved && i > MAX_ITERATIONS / 2) break; 
    }

    // 5. Actualizar la posición de las etiquetas y ajustar los puntos del codo
    textElements.attr("transform", d => `translate(${d.x}, ${d.y})`);

    labels.forEach(d => {
        // El codo Y debe estar al centro del texto
        d.elbowY = d.y + d.height / 2; 
        // El codo X debe ser el punto más cercano al hito en el borde izquierdo del texto
        d.elbowX = d.x; 
        // Asegurarse de que el codo no retroceda más allá del hito.
        if (d.elbowX < d.nodeX + NODE_RADIUS + 5) { // Un pequeño margen
            d.elbowX = d.nodeX + NODE_RADIUS + 5;
        }
    });


    // 6. Dibujar los conectores como Path (líneas en codo)
    connectorGroup.selectAll("path.connector")
        .data(labels)
        .join("path")
        .attr("class", "connector")
        .attr("d", d => {
            // M = Mover a (start point: borde del hito)
            // L = Línea horizontal al codo X (manteniendo Y del hito)
            // L = Línea vertical al codo Y (manteniendo X del codo)
            // L = Línea horizontal al inicio del texto
            return `M ${d.nodeX + NODE_RADIUS} ${d.nodeY} L ${d.elbowX} ${d.nodeY} L ${d.elbowX} ${d.elbowY} L ${d.x} ${d.elbowY}`;
        })
        .attr("fill", "none")
        .attr("stroke", "#888")
        .attr("stroke-width", 0.5);


    // Tooltip (adjunto al círculo)
    nodeGroup.append("title")
        .text(d => `${d.title} (${d.year})\nDescripción: ${d.description} \nAutores: ${d.authors} \nFuente: ${d.source} \nRama: ${d.hierarchy.join(' ➔ ')}`);
}

// Iniciar la carga de datos
loadData();