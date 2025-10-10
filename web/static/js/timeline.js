// 1. Datos del Proyecto (Hitos y Conexiones)
const data = {
    // Añado un hito extra en 2005 para demostrar el jittering
    "nodes": [
        // I. Fundamentos y Formalización
        { "id": "FODA_90", "year": 1990, "title": "FODA (Feature Diagram)", "authors": "Kang et al.", "category": "I. Fundamentos", "y_pos": 1 },
        { "id": "Logic_01", "year": 2001, "title": "Formalización Lógica (SAT)", "authors": "Batory et al.", "category": "I. Fundamentos", "y_pos": 1 },
        // II. Expresividad y Modelado Avanzado (Años y líneas coincidentes para el Jittering)
        { "id": "CFM_05", "year": 2005, "title": "Cardinality FMs (CFMs)", "authors": "Czarnecki & Antkiewicz", "category": "II. Expresividad", "y_pos": 2 },
        { "id": "AFM_05", "year": 2005, "title": "Attributed FMs (AFMs)", "authors": "Thiel & Hein", "category": "II. Expresividad", "y_pos": 2 },
        { "id": "Testing_05", "year": 2005, "title": "Testing de SPL (Hito Jitter)", "authors": "Engels et al.", "category": "II. Expresividad", "y_pos": 2 }, // TERCER HITO EN 2005, LÍNEA 2
        // III. Implementación de Variabilidad
        { "id": "Mapping_04", "year": 2004, "title": "Mapping FM a Solution Space", "authors": "Von der Maßen & Lichter", "category": "III. Implementación", "y_pos": 3 },
        // IV. Ingeniería de Configuración y Optimización
        { "id": "Dead_07", "year": 2007, "title": "Análisis de Propiedades (Dead Features)", "authors": "Benavides et al.", "category": "IV. Configuración", "y_pos": 4 },
        // V. Evolución y Mantenimiento
        { "id": "Mining_14", "year": 2014, "title": "Feature Mining (Extracción automática)", "authors": "López-Herrejon et al.", "category": "V. Evolución", "y_pos": 5 },
    ],
    "links": [
        { "source": "FODA_90", "target": "Logic_01" },
        { "source": "Logic_01", "target": "CFM_05" },
        { "source": "Logic_01", "target": "AFM_05" }, 
        { "source": "Logic_01", "target": "Testing_05" }, 
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
    .range([50, height - 50]); 

// 3. Cálculo de Jittering (Desplazamiento Vertical)
const JITTER_AMOUNT = 15; // Distancia de separación vertical en píxeles

// Agrupamos los nodos por su posición única (Año + Rama)
const nodesByPosition = d3.group(data.nodes, d => `${d.year}-${d.y_pos}`);

// Aplicamos el desplazamiento a cada nodo
data.nodes.forEach(node => {
    const key = `${node.year}-${node.y_pos}`;
    const group = nodesByPosition.get(key);
    const total = group.length;

    if (total > 1) {
        // Encontramos el índice del nodo dentro de su grupo
        const index = group.indexOf(node);
        // Desplazamiento calculado para centrar el grupo
        // (index - (total - 1) / 2) da valores como [-1, 0, 1] para total=3
        node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
    } else {
        node.y_jitter = 0; // Sin desplazamiento
    }
});

// 4. Escalas y Colores
const minYear = d3.min(data.nodes, d => d.year);
const maxYear = new Date().getFullYear(); 

const xScale = d3.scaleLinear()
    .domain([minYear - 2, maxYear + 1])
    .range([0, width]);

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
// (Usar la lógica del script anterior para dibujar líneas y etiquetas)
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
// Función simple para encontrar un nodo por ID
const getNode = (id) => data.nodes.find(n => n.id === id);

svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(data.links)
    .join("line")
    .attr("class", "link")
    // Usamos las coordenadas ajustadas (y_jitter) para los enlaces
    .attr("x1", d => xScale(getNode(d.source).year))
    .attr("y1", d => yPosScale(getNode(d.source).y_pos) + getNode(d.source).y_jitter)
    .attr("x2", d => xScale(getNode(d.target).year))
    .attr("y2", d => yPosScale(getNode(d.target).y_pos) + getNode(d.target).y_jitter)
    .attr("stroke", d => colorScale(getNode(d.target).category));


// D. Nodos (Nodes)
const nodeGroup = svg.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(data.nodes)
    .join("g")
    .attr("class", "node")
    // Aplicamos el jitter al transform
    .attr("transform", d => `translate(${xScale(d.year)}, ${yPosScale(d.y_pos) + d.y_jitter})`);

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