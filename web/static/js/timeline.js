// CONFIGURACIÓN GLOBAL
const margin = { top: 50, right: 30, bottom: 50, left: 200 };
const svgElement = d3.select("#timeline-svg");
const width = parseInt(svgElement.attr("width")) - margin.left - margin.right;
const height = parseInt(svgElement.attr("height")) - margin.top - margin.bottom;

const svg = svgElement.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const JITTER_AMOUNT = 15; // Desplazamiento vertical entre hitos en la misma posición (jittering)
const OFFSET_INCREMENT = 30; // Espacio vertical entre mini-ramas (subcategorías)
let yPosScale, xScale, colorScale; // Variables de escala

// --- FUNCIONES DE ASISTENCIA ---

// Función stub para obtener los detalles de la referencia BibTeX
// NOTA: Reemplaza esto con tu lógica real de carga y parseo de references.bib
const getBibDetails = (bibKey) => {
    // Datos de ejemplo para simular la carga de BibTeX
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

    // 3. ASIGNACIÓN AUTOMÁTICA DE POSICIÓN Y (`y_pos`) y CÁLCULO DE MINI-RAMAS

    // 3.1. Obtener y Ordenar las categorías principales
    const categories = Array.from(new Set(data.nodes.map(d => d.category))).sort();

    // 3.2. Crear el Mapeo de Categoría Principal (String -> Posición Base Numérica)
    const categoryMap = new Map();
    categories.forEach((cat, index) => {
        categoryMap.set(cat, index + 1); // Asigna 1, 2, 3...
    });

    // 3.3. Crear Mapeo de Subcategoría (String -> Offset Vertical de la Rama)
    const subcategoryOffsets = new Map(); 

    categories.forEach(catName => {
        // Extraer y ordenar las subcategorías dentro de la categoría actual
        const subcatsInCat = Array.from(new Set(
            data.nodes
                .filter(d => d.category === catName)
                .map(d => d.subcategory || catName) // Usar el nombre de la categoría si subcategory es nulo
        )).sort();

        // Asignar offset simétricamente: (ej. 3 subcats -> [-30, 0, 30])
        const numSubcats = subcatsInCat.length;
        const centerIndex = (numSubcats - 1) / 2;
        
        subcatsInCat.forEach((subcatName, index) => {
            const offsetKey = `${catName}|${subcatName}`;
            // Calcula el offset: (índice - índice central) * incremento.
            const offset = (index - centerIndex) * OFFSET_INCREMENT;
            subcategoryOffsets.set(offsetKey, offset);
        });
    });


    // 3.4. Asignar las posiciones finales (`y_pos` y `y_branch_offset`) a cada nodo
    data.nodes.forEach(node => {
        node.y_pos = categoryMap.get(node.category);
        
        const subcatName = node.subcategory || node.category; 
        const offsetKey = `${node.category}|${subcatName}`;
        
        // Asigna el offset de la mini-rama
        node.y_branch_offset = subcategoryOffsets.get(offsetKey) || 0; 
    });


    // 4. CÁLCULO DE ESCALAS
    
    yPosScale = d3.scalePoint()
        .domain(categories.map(cat => categoryMap.get(cat)).sort(d3.ascending))
        .range([50, height - 50]); 

    const minYear = d3.min(data.nodes, d => d.year);
    const maxYear = new Date().getFullYear(); 
    xScale = d3.scaleLinear()
        .domain([minYear - 2, maxYear + 1])
        .range([0, width]);

    const colorDomain = Array.from(new Set(data.nodes.map(d => d.category)));
    colorScale = d3.scaleOrdinal()
        .domain(colorDomain)
        .range(d3.schemeCategory10);
    
    // 5. CÁLCULO DE JITTERING (Manejar solapamiento dentro de la mini-rama)
    // Agrupamos por Año + Posición Base + Offset de Rama
    const nodesByPosition = d3.group(data.nodes, d => `${d.year}-${d.y_pos}-${d.y_branch_offset}`);

    data.nodes.forEach(node => {
        const key = `${node.year}-${node.y_pos}-${node.y_branch_offset}`;
        const group = nodesByPosition.get(key); 
        
        if (group) {
            const total = group.length;
            if (total > 1) {
                const index = group.indexOf(node);
                node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
            } else {
                node.y_jitter = 0;
            }
        } else {
             node.y_jitter = 0;
        }
    });

    // --- DIBUJO ---

    // A. Eje X
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).tickValues(d3.range(minYear, maxYear + 1, 5)))
        .selectAll("text")
        .attr("class", "year-label");

    // B. Ramas (Líneas y Etiquetas de Categoría/Subcategoría)
    
    // Dibuja CADA mini-línea y su etiqueta de subcategoría/categoría
    Array.from(subcategoryOffsets.entries()).forEach(([key, offset]) => {
        const [catName, subcatName] = key.split('|');
        const yBase = yPosScale(categoryMap.get(catName));
        const y = yBase + offset; // Posición Y final de la mini-rama
        
        // Dibuja la mini-línea
        svg.append("line")
            .attr("x1", 0).attr("y1", y)
            .attr("x2", width).attr("y2", y)
            .attr("stroke", "#ddd").attr("stroke-dasharray", "4,4");
            
        // Dibuja la etiqueta de la Subcategoría/Categoría
        svg.append("text")
            .attr("class", "subcategory-label")
            .attr("x", -10)
            .attr("y", y)
            .attr("dy", "0.31em")
            .attr("text-anchor", "end")
            // Si la subcategoría es diferente a la categoría, la etiqueta
            .text(subcatName !== catName ? `— ${subcatName}` : catName); 
    });


    // C. Enlaces (Links)
    const getNode = (id) => data.nodes.find(n => n.id === id);

    // Filtrar enlaces inválidos ANTES de dibujarlos
    const validLinks = data.links.filter(d => {
        return getNode(d.source) !== undefined && getNode(d.target) !== undefined;
    });

    svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(validLinks)
        .join("line")
        .attr("class", "link")
        // Usa las tres componentes de la posición Y: base, rama, jitter
        .attr("x1", d => xScale(getNode(d.source).year))
        .attr("y1", d => yPosScale(getNode(d.source).y_pos) + getNode(d.source).y_branch_offset + getNode(d.source).y_jitter)
        .attr("x2", d => xScale(getNode(d.target).year))
        .attr("y2", d => yPosScale(getNode(d.target).y_pos) + getNode(d.target).y_branch_offset + getNode(d.target).y_jitter)
        .attr("stroke", d => colorScale(getNode(d.target).category));


    // D. Nodos (Nodes)
    const nodeGroup = svg.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(data.nodes)
        .join("g")
        .attr("class", "node")
        // Usa las tres componentes de la posición Y
        .attr("transform", d => `translate(${xScale(d.year)}, ${yPosScale(d.y_pos) + d.y_branch_offset + d.y_jitter})`);

    // Círculos de los hitos
    nodeGroup.append("circle")
        .attr("r", 6)
        .attr("fill", d => colorScale(d.category));

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
        .text(d => `${d.title} (${d.year}) \nAutores: ${d.authors} \nFuente: ${d.source} \nMini-Rama: ${d.subcategory || d.category}`);
}

// Iniciar la carga de datos
loadData();