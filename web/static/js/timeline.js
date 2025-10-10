// CONFIGURACIÓN GLOBAL
const margin = { top: 50, right: 30, bottom: 50, left: 200 };
const svgElement = d3.select("#timeline-svg");
const width = parseInt(svgElement.attr("width")) - margin.left - margin.right;
const height = parseInt(svgElement.attr("height")) - margin.top - margin.bottom;

const svg = svgElement.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const JITTER_AMOUNT = 15; // Desplazamiento vertical entre hitos en la misma posición (jittering)
const PATH_DELIMITER = '.'; // Separador usado en el campo 'path' (e.g., "Fundamentos.Análisis.SAT")
const BOX_PADDING = 15; // Espacio de relleno alrededor de los nodos dentro de la caja
let yPosScale, xScale, colorScale; // Variables de escala

// --- FUNCIONES DE ASISTENCIA ---

// Función stub para obtener los detalles de la referencia BibTeX
const getBibDetails = (bibKey) => {
    // Datos de ejemplo: DEBE SER REEMPLAZADO por la lógica de carga de references.bib
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
    
    // 2. FUSIÓN DE DATOS (Añadir detalles BibTeX)
    data.nodes.forEach(node => {
        const details = getBibDetails(node.bib_key);
        node.authors = details.authors;
        node.source = details.source;
    });

    // 3. ASIGNACIÓN AUTOMÁTICA DE POSICIÓN Y Y PREPARACIÓN DE BOUNDING BOXES
    
    const allPaths = data.nodes.map(d => d.path.split(PATH_DELIMITER));
    const primaryCategories = Array.from(new Set(allPaths.map(p => p[0]))).sort();
    
    // 3.1. Mapeo de Categoría Principal (Posición Base Numérica)
    const categoryMap = new Map();
    primaryCategories.forEach((cat, index) => {
        categoryMap.set(cat, index + 1); 
    });

    // 3.2. Asignar la posición Y base
    data.nodes.forEach(node => {
        const primaryCat = node.path.split(PATH_DELIMITER)[0];
        node.y_pos = categoryMap.get(primaryCat); // Esta es la posición Y base de la línea
        node.full_path = node.path; 
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

    const colorDomain = Array.from(new Set(data.nodes.map(d => d.path.split(PATH_DELIMITER)[0])));
    colorScale = d3.scaleOrdinal()
        .domain(colorDomain)
        .range(d3.schemeCategory10);
    
    // 5. CÁLCULO DE JITTERING
    // Agrupamos solo por Año y Posición Base (y_pos)
    const nodesByPosition = d3.group(data.nodes, d => `${d.year}-${d.y_pos}`);

    data.nodes.forEach(node => {
        const key = `${node.year}-${node.y_pos}`;
        const group = nodesByPosition.get(key); 
        
        if (group) {
            const total = group.length;
            if (total > 1) {
                const index = group.indexOf(node);
                // Calcula el jittering para separar hitos en la misma línea principal y año
                node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
            } else {
                node.y_jitter = 0;
            }
        } else {
             node.y_jitter = 0;
        }
    });
    
    // 6. CÁLCULO FINAL DE LÍMITES DE LAS CAJAS (Bounding Boxes)
    const boundingBoxes = new Map(); 
    const nodesByFullPath = d3.group(data.nodes, d => d.full_path);
    
    nodesByFullPath.forEach((nodesInBranch, fullPath) => {
        const pathParts = fullPath.split(PATH_DELIMITER);
        const primaryCat = pathParts[0];
        
        // La posición Y de un nodo es: yPosScale(d.y_pos) + d.y_jitter
        
        const box = {
            path: fullPath,
            name: pathParts.join(' ➔ '),
            category: primaryCat,
            level: pathParts.length,
            nodes: nodesInBranch,
            
            x_min: d3.min(nodesInBranch, d => xScale(d.year)) - BOX_PADDING,
            x_max: d3.max(nodesInBranch, d => xScale(d.year)) + BOX_PADDING,
            y_min: d3.min(nodesInBranch, d => yPosScale(d.y_pos) + d.y_jitter) - BOX_PADDING,
            y_max: d3.max(nodesInBranch, d => yPosScale(d.y_pos) + d.y_jitter) + BOX_PADDING
        };
        box.width = box.x_max - box.x_min;
        box.height = box.y_max - box.y_min;
        
        boundingBoxes.set(fullPath, box);
    });


    // --- DIBUJO ---
    
    // A. Eje X
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).tickValues(d3.range(minYear, maxYear + 1, 5)))
        .selectAll("text")
        .attr("class", "year-label");

    // B. Ramas y Bounding Boxes

    // 1. Dibuja las líneas horizontales principales (Base de la Categoría)
    primaryCategories.forEach(catName => {
        const y = yPosScale(categoryMap.get(catName));
        
        svg.append("line")
            .attr("x1", 0).attr("y1", y)
            .attr("x2", width).attr("y2", y)
            .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
            
        // Etiqueta de la categoría principal (a la izquierda)
        svg.append("text")
            .attr("class", "category-label")
            .attr("x", -10).attr("y", y)
            .attr("dy", "0.31em").attr("text-anchor", "end")
            .style("font-weight", "bold")
            .text(catName); 
    });

    // 2. Dibuja las Bounding Boxes (Cajas Punteadas) y sus etiquetas
    // Ordenamos para dibujar los niveles más altos (cajas grandes) primero
    const sortedBoxes = Array.from(boundingBoxes.values()).sort((a, b) => d3.ascending(b.level, a.level));

    sortedBoxes.forEach(box => {
        // La caja se dibuja para cualquier nivel (incluso el nivel 1)
        if (box.width > 0 && box.height > 0) { 
            
            // Dibuja el rectángulo punteado
            svg.append("rect")
                .attr("x", box.x_min)
                .attr("y", box.y_min)
                .attr("width", box.width)
                .attr("height", box.height)
                .attr("fill", "none")
                .attr("stroke", colorScale(box.category))
                .attr("stroke-dasharray", "5,3")
                .attr("stroke-width", box.level === 1 ? 2 : 1); // Más grueso para Categoría Principal

            // Dibuja la etiqueta de la caja (en la parte superior centrada)
            svg.append("text")
                .attr("x", box.x_min + box.width / 2) // Centro X de la caja
                .attr("y", box.y_min - 5) // 5px por encima del borde
                .attr("text-anchor", "middle")
                .style("font-size", "12px")
                .style("font-style", "italic")
                .style("fill", colorScale(box.category))
                .text(box.name);
        }
    });

    // C. Enlaces (Links)
    const getNode = (id) => data.nodes.find(n => n.id === id);

    const validLinks = data.links.filter(d => {
        return getNode(d.source) !== undefined && getNode(d.target) !== undefined;
    });

    svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(validLinks)
        .join("line")
        .attr("class", "link")
        // Posición Y es: yPosScale(d.y_pos) + d.y_jitter
        .attr("x1", d => xScale(getNode(d.source).year))
        .attr("y1", d => yPosScale(getNode(d.source).y_pos) + getNode(d.source).y_jitter)
        .attr("x2", d => xScale(getNode(d.target).year))
        .attr("y2", d => yPosScale(getNode(d.target).y_pos) + getNode(d.target).y_jitter)
        .attr("stroke", d => colorScale(getNode(d.target).full_path.split(PATH_DELIMITER)[0]));


    // D. Nodos (Nodes)
    const nodeGroup = svg.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .attr("class", "node")
        // Posición Y es: yPosScale(d.y_pos) + d.y_jitter
        .attr("transform", d => `translate(${xScale(d.year)}, ${yPosScale(d.y_pos) + d.y_jitter})`);

    // Círculos de los hitos
    nodeGroup.append("circle")
        .attr("r", 6)
        .attr("fill", d => colorScale(d.full_path.split(PATH_DELIMITER)[0]));

    // Etiquetas de los hitos (Título y Año)
    nodeGroup.append("text")
        .attr("dx", 8) 
        .attr("dy", 3)
        .text(d => `${d.title} (${d.year})`)
        .style("text-anchor", "start")
        // ROTACIÓN DE TEXTO: Evita el solapamiento horizontal
        .attr("transform", "rotate(-25)"); 

    // Tooltip
    nodeGroup.append("title")
        .text(d => `${d.title} (${d.year}) \nAutores: ${d.authors} \nFuente: ${d.source} \nRama: ${d.full_path}`);
}

// Iniciar la carga de datos
loadData();