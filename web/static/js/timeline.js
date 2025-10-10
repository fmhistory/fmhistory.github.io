// 1. Datos del Proyecto (Hitos y Conexiones)
const data = {
    // Array de los hitos (Nodos)
    "nodes": [
        // I. Fundamentos y Formalización
        { "id": "FODA_90", "year": 1990, "title": "FODA (Feature Diagram)", "authors": "Kang et al.", "category": "I. Fundamentos", "y_pos": 1 },
        { "id": "Logic_01", "year": 2001, "title": "Formalización Lógica (SAT)", "authors": "Batory et al.", "category": "I. Fundamentos", "y_pos": 1 },
        // II. Expresividad y Modelado Avanzado
        { "id": "CFM_05", "year": 2005, "title": "Cardinality FMs (CFMs)", "authors": "Czarnecki & Antkiewicz", "category": "II. Expresividad", "y_pos": 2 },
        { "id": "AFM_05", "year": 2005, "title": "Attributed FMs (AFMs)", "authors": "Thiel & Hein", "category": "II. Expresividad", "y_pos": 2 },
        // III. Implementación de Variabilidad
        { "id": "Mapping_04", "year": 2004, "title": "Mapping FM a Solution Space", "authors": "Von der Maßen & Lichter", "category": "III. Implementación", "y_pos": 3 },
        // IV. Ingeniería de Configuración y Optimización
        { "id": "Dead_07", "year": 2007, "title": "Análisis de Propiedades (Dead Features)", "authors": "Benavides et al.", "category": "IV. Configuración", "y_pos": 4 },
        // V. Evolución y Mantenimiento
        { "id": "Mining_14", "year": 2014, "title": "Feature Mining (Extracción automática)", "authors": "López-Herrejon et al.", "category": "V. Evolución", "y_pos": 5 },
    ],
    // Array de conexiones (Enlaces)
    "links": [
        { "source": "FODA_90", "target": "Logic_01" },
        { "source": "Logic_01", "target": "CFM_05" },
        { "source": "Logic_01", "target": "AFM_05" }, 
        { "source": "FODA_90", "target": "Mapping_04" }, 
        { "source": "Logic_01", "target": "Dead_07" },
        { "source": "Logic_01", "target": "Mining_14" }
    ]
};

// 2. Configuración de D3.js
const margin = { top: 50, right: 30, bottom: 50, left: 200 };
const svgElement = d3.select("#timeline-svg");
const width = parseInt(svgElement.attr("width")) - margin.left - margin.right;
const height = parseInt(svgElement.attr("height")) - margin.top - margin.bottom;

const svg = svgElement.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Mapeo de y_pos a coordenada Y real
const yPosScale = d3.scalePoint()
    .domain(data.nodes.map(d => d.y_pos).sort(d3.ascending))
    .range([50, height - 50]); // Rango visible en el SVG

// 3. Escala de Tiempo (Eje X)
const minYear = d3.min(data.nodes, d => d.year);
const maxYear = new Date().getFullYear(); 

const xScale = d3.scaleLinear()
    .domain([minYear - 2, maxYear + 1])
    .range([0, width]);

// 4. Definición de colores por Categoría
const categories = Array.from(new Set(data.nodes.map(d => d.category)));
const colorScale = d3.scaleOrdinal()
    .domain(categories)
    .range(d3.schemeCategory10);

// --- Dibujo ---

// A. Eje X
svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).tickValues(d3.range(minYear, maxYear + 1, 5)))
    .selectAll("text")
    .attr("class", "year-label");

// B. Ramas (Líneas y Etiquetas)
const uniqueCategories = Array.from(new Set(data.nodes.map(d => d.category)))
    .map(name => ({
        name: name,
        y_pos: data.nodes.find(d => d.category === name).y_pos
    }))
    .sort((a, b) => d3.ascending(a.y_pos, b.y_pos));

uniqueCategories.forEach(cat => {
    const y = yPosScale(cat.y_pos);
    
    // Línea de la rama
    svg.append("line")
        .attr("x1", 0)
        .attr("y1", y)
        .attr("x2", width)
        .attr("y2", y)
        .attr("stroke", "#bdc3c7")
        .attr("stroke-dasharray", "4,4");
    
    // Etiqueta de la rama
    svg.append("text")
        .attr("class", "category-label")
        .attr("x", -10)
        .attr("y", y)
        .attr("dy", "0.31em")
        .attr("text-anchor", "end")
        .text(cat.name);
});

// C. Enlaces (Links)
// Función para encontrar las coordenadas de un nodo por su ID
const getNodeCoords = (id) => {
    const node = data.nodes.find(n => n.id === id);
    return {
        x: xScale(node.year),
        y: yPosScale(node.y_pos)
    };
};

svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("class", "link")
    .attr("x1", d => getNodeCoords(d.source).x)
    .attr("y1", d => getNodeCoords(d.source).y)
    .attr("x2", d => getNodeCoords(d.target).x)
    .attr("y2", d => getNodeCoords(d.target).y)
    .attr("stroke", d => colorScale(data.nodes.find(n => n.id === d.target).category));


// D. Nodos (Nodes)
const nodeGroup = svg.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(data.nodes)
    .join("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${xScale(d.year)}, ${yPosScale(d.y_pos)})`);

// Círculos de los hitos
nodeGroup.append("circle")
    .attr("r", 6)
    .attr("fill", d => colorScale(d.category));

// Etiquetas de los hitos (Título y Año)
nodeGroup.append("text")
    .attr("dx", 10) 
    .attr("dy", 3)
    .text(d => `${d.title} (${d.year})`)
    .style("text-anchor", "start");

// Tooltip (al pasar el ratón)
nodeGroup.append("title")
    .text(d => `${d.title} \nAutores: ${d.authors}`);