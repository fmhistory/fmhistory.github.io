// 1. Configuración de D3.js
const margin = { top: 50, right: 30, bottom: 50, left: 200 };
const svgElement = d3.select("#timeline-svg");
const width = parseInt(svgElement.attr("width")) - margin.left - margin.right;
const height = parseInt(svgElement.attr("height")) - margin.top - margin.bottom;

const svg = svgElement.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Mapeo de y_pos a coordenada Y real (Se moverá dentro de loadData)
let yPosScale;
let xScale;
let colorScale;

const JITTER_AMOUNT = 15; // Distancia de separación vertical en píxeles

// Función stub para obtener los detalles de la referencia BibTeX
// En un proyecto real, cargarías y parsearías references.bib aquí.
const getBibDetails = (bibKey) => {
    // Ejemplo de datos duros que simulan la carga de BibTeX.
    // DEBES REEMPLAZAR ESTO con la lógica real de carga y búsqueda en references.bib
    const details = {
        "Kang1990FODA": { "authors": "Kang et al.", "source": "SEI Tech Report" },
        "Batory2001Generative": { "authors": "Batory et al.", "source": "Generative Prog. Book" },
        "Czarnecki2005CFM": { "authors": "Czarnecki & Antkiewicz", "source": "ICSE '05" },
        "Thiel2005AFM": { "authors": "Thiel & Hein", "source": "SPLC '05" },
        "Engels2005Testing": { "authors": "Engels et al.", "source": "SPLiT '05" }
    };
    return details[bibKey] || { "authors": "Desconocido", "source": "Desconocida" };
};


// 2. Función principal para cargar y dibujar los datos
async function loadData() {
    // Cargar el JSON del gráfico
    const data = await d3.json("static/data/timeline_data.json");
    
    // 3. FUSIONAR DATOS: Añadir detalles de BibTeX a cada nodo
    data.nodes.forEach(node => {
        const details = getBibDetails(node.bib_key);
        node.authors = details.authors;
        node.source = details.source;
    });

   // --- NUEVA LÓGICA DE ASIGNACIÓN DE POSICIÓN Y ---

    // 4.1. Obtener y Ordenar las categorías
    // Se extraen las categorías únicas y se ordenan alfabéticamente (I, II, III, etc.)
    const categories = Array.from(new Set(data.nodes.map(d => d.category))).sort();

    // 4.2. Crear el Mapeo (Category String -> Posición Numérica)
    // Map: {"I. Fundamentos": 1, "II. Expresividad": 2, ...}
    const categoryMap = new Map();
    categories.forEach((cat, index) => {
        categoryMap.set(cat, index + 1);
    });
    
    // 4.3. Asignar la posición numérica (y_pos) a cada nodo
    data.nodes.forEach(node => {
        node.y_pos = categoryMap.get(node.category);
    });
    
    // 5. CÁLCULO DE ESCALAS
    
    // La escala Y ahora usa los valores calculados (1, 2, 3...)
    yPosScale = d3.scalePoint()
        .domain(categories.map(cat => categoryMap.get(cat)).sort(d3.ascending))
        .range([50, height - 50]); 

    const minYear = d3.min(data.nodes, d => d.year);
    const maxYear = new Date().getFullYear(); 
    xScale = d3.scaleLinear()
        .domain([minYear - 2, maxYear + 1])
        .range([0, width]);

    // La escala de color sigue usando el nombre de la categoría (string)
    const colorDomain = Array.from(new Set(data.nodes.map(d => d.category)));
    colorScale = d3.scaleOrdinal()
        .domain(colorDomain)
        .range(d3.schemeCategory10);
    
    // 6. CÁLCULO DE JITTERING (La lógica de Jittering funciona igual)
    const nodesByPosition = d3.group(data.nodes, d => `${d.year}-${d.y_pos}`);
    // ... (rest of Jittering logic remains unchanged) ...
    data.nodes.forEach(node => {
        const key = `${node.year}-${node.y_pos}`;
        const group = nodesByPosition.get(key);
        const total = group.length;

        if (total > 1) {
            const index = group.indexOf(node);
            node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
        } else {
            node.y_jitter = 0;
        }
    });

// 7. DIBUJO DEL GRÁFICO (El código de dibujo sigue casi igual)

    // B. Ramas (Líneas y Etiquetas)
    // Usamos el array 'categories' que ya está ordenado
    categories.forEach(catName => {
        const y_pos_val = categoryMap.get(catName);
        const y = yPosScale(y_pos_val); // Usamos la escala Y con el valor numérico
        
        // Línea de la rama
        svg.append("line")
            .attr("x1", 0).attr("y1", y)
            .attr("x2", width).attr("y2", y)
            .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
        
        // Etiqueta de la rama (usa el nombre de la categoría, no el índice)
        svg.append("text")
            .attr("class", "category-label").attr("x", -10).attr("y", y)
            .attr("dy", "0.31em").attr("text-anchor", "end")
            .text(catName);
    });

    // C. Enlaces (Links)
    const getNode = (id) => data.nodes.find(n => n.id === id);

    svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(data.links)
        .join("line")
        .attr("class", "link")
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
        .attr("transform", d => `translate(${xScale(d.year)}, ${yPosScale(d.y_pos) + d.y_jitter})`);

    // Círculos de los hitos
    nodeGroup.append("circle")
        .attr("r", 6)
        .attr("fill", d => colorScale(d.category));

    // Etiquetas de los hitos (Título y Año)
    nodeGroup.append("text")
        .attr("dx", 10).attr("dy", 3)
        .text(d => `${d.title} (${d.year})`)
        .style("text-anchor", "start");

    // Tooltip: Ahora incluye los datos extraídos de la "referencia"
    nodeGroup.append("title")
        .text(d => `${d.title} (${d.year}) \nAutores: ${d.authors} \nFuente: ${d.source} \nClave BibTeX: ${d.bib_key}`);
}

// Iniciar la carga de datos
loadData();