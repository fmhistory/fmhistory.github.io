/**
 * Timeline.js
 * * Module responsible for D3.js visualization and interaction logic.
 */


const d3 = window.d3;  // D3.js is assumed to be globally available (loaded in the HTML)


class Timeline {
    /**
     * Constructor for the Timeline visualization.
     * @param {string} selector - The CSS selector for the container element (e.g., "#timeline-container").
     * @param {Object} data - The processed data object containing 'nodes' and 'links'.
     */
    constructor(selector, data) {
        this.nodes = data.nodes || []; 
        this.links = data.links || []; 
        this.containerSelector = selector;
        this.margin = { top: 50, right: 20, bottom: 30, left: 150 };
        this.width = 0; 
        this.height = 0;

        this.svg = null; // El elemento SVG principal
        this.chartArea = null; // El grupo que contiene todos los elementos de la visualización

        // Propiedades de Escala y Layout
        this.xScale = null;
        this.yScale = null;
        this.colorScale = null;
        this.categoryMap = new Map(); // Para mapear categorías a un índice vertical
        this.nodesById = new Map(this.nodes.map(d => [d.id, d]));
        this.boundingBoxes = new Map(); // Para guardar las cajas de subcategorías

        // --- CONSTANTES (Traídas de timeline_old.js) ---
        this.CONFIG = {
            NODE_RADIUS: 4, 
            JITTER_AMOUNT: 50, // Máxima distancia vertical para dispersar
            BOX_PADDING: 15, // Relleno alrededor de los hitos al calcular la caja
            TEMP_PATH_DELIMITER: '|', // Delimitador para jerarquía
            VERTICAL_SPACING_FACTOR: 1.5,  // Aumenta el espacio vertical entre categorías (ajusta este valor si es necesario)
        };

        this._calculateVerticalPositions();
        this._initializeSVG();
    }

    /**
     * Initializes the main SVG canvas and the chart area group.
     */
    _initializeSVG() {
        this.svg = d3.select(this.containerSelector);

        // 2. Establecer valores de trabajo iniciales (temporales)
        this.width = 1000; 
        this.height = 600;
        
        const fullWidth = this.width + this.margin.left + this.margin.right;
        const fullHeight = this.height + this.margin.top + this.margin.bottom;

        // 3. Aplicar dimensiones iniciales al SVG existente
        this.svg
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .attr("viewBox", `0 0 ${fullWidth} ${fullHeight}`);

        // 4. Crear el grupo de área de dibujo
        this.chartArea = this.svg.append("g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    }

    /**
     * Calculates the vertical position index (y_pos) for each node based on its primary category.
     * This ensures all nodes in the same primary category share the same baseline Y-position.
     */
    _calculateVerticalPositions() {
        if (this.nodes.length === 0) return;

        // 1. Encontrar todas las categorías principales (Primer elemento de 'hierarchy')
        const categories = Array.from(new Set(this.nodes.map(d => d.hierarchy[0]))).sort();
        
        // 2. Crear un mapa de Categoría -> Índice (y_pos)
        // El índice es la posición de la línea base en el eje Y.
        categories.forEach((cat, index) => {
            // Usamos index + 1 para evitar el índice 0, que puede ser útil para márgenes.
            this.categoryMap.set(cat, index + 1); 
        });

        // 3. Asignar el y_pos base a cada nodo
        this.nodes.forEach(node => {
            // node.hierarchy[0] es la categoría principal
            node.y_pos_base = this.categoryMap.get(node.hierarchy[0]);
            
            // Inicializar y_pos_final. Esto será ajustado por la lógica de stacking.
            node.y_pos = node.y_pos_base; 

            // Para el cálculo de bounding boxes (caminos completos)
            node.full_path = node.hierarchy.join(this.CONFIG.TEMP_PATH_DELIMITER);
        });
        
        // El número total de líneas base verticales es el tamaño del mapa.
        this.yDomainSize = this.categoryMap.size;
    }
    
    /**
     * Defines the D3 scales based on the data domain and output range.
     */
    _setupScales() {
        // --- 1. CÁLCULO DINÁMICO DEL ALTO (Height) ---

        // La altura de la categoría debe ser mayor para acomodar el jittering y las bounding boxes
        const categoryHeight = 50 * this.CONFIG.VERTICAL_SPACING_FACTOR; // Usamos el nuevo factor
        
        // CORRECCIÓN para dar más espacio arriba (y el padding ya lo da abajo)
        this.height = (this.yDomainSize * categoryHeight) + 100; // Altura base
        
        // --- 2. CÁLCULO DINÁMICO DEL ANCHO (Width) ---
        
        const yearExtent = d3.extent(this.nodes, d => d.year);
        
        // Opción A: Ancho basado en el rango de Años
        const minPixelsPerYear = 30; // 30px por año es un buen mínimo.
        const startYear = yearExtent[0] || (new Date().getFullYear() - 10);
        const endYear = yearExtent[1] || (new Date().getFullYear());
        const totalYears = endYear - startYear + 1;
        
        let calculatedWidth = totalYears * minPixelsPerYear;
        
        // Opción B: Asegurar un ancho mínimo absoluto si el rango de años es pequeño
        this.width = Math.max(calculatedWidth, 900); // 900px como mínimo absoluto de ancho.
        // --- 3. ACTUALIZACIÓN CRÍTICA DEL SVG ---
        
        const fullWidth = this.width + this.margin.left + this.margin.right;
        const fullHeight = this.height + this.margin.top + this.margin.bottom;

        // ¡Actualizamos las dimensiones del SVG creado en _initializeSVG!
        this.svg
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .attr("viewBox", `0 0 ${fullWidth} ${fullHeight}`);

        // --- 4. DEFINICIÓN DE ESCALAS ---
        // Escala X (Tiempo) - Utiliza el nuevo this.width
        const yearPadding = (endYear - startYear) * 0.05;
        const paddedDomain = [
            startYear - yearPadding, 
            endYear + yearPadding
        ];

        this.xScale = d3.scaleLinear()
            .domain(paddedDomain) 
            .range([0, this.width]); // Rango utiliza el ancho dinámico

        // Escala Y (Posición vertical) - Utiliza el nuevo this.height
        this.yScale = d3.scalePoint() 
            .domain(d3.range(1, this.yDomainSize + 1)) //Ampliamos el dominio para añadir un "carril" vacío al principio y al final
            //.domain(d3.range(0, this.yDomainSize + 2)) //Ampliamos el dominio para añadir un "carril" vacío al principio y al final
            .range([this.height, 0])
            .padding(0.5); 
            
        // Escala de Color (se mantiene igual)
        const categories = Array.from(this.categoryMap.keys());
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10) 
            .domain(categories);
    }
    
    /**
     * Implementa el Baricenter y el Jittering para la posición vertical final (d.y_pos).
     * Basado en calculateNodePositions de timeline_old.js.
     */
    _calculateNodeFinalPositions() {
        const { JITTER_AMOUNT } = this.CONFIG;

        // 1. Calcular coordenadas iniciales (x_coord, y_coord)
        this.nodes.forEach(node => {
            node.x_coord = this.xScale(node.year); 
            node.y_coord = this.yScale(node.y_pos_base); // Posición de la línea central
        });

        const nodesByYPos = d3.group(this.nodes, d => d.y_pos_base);

        nodesByYPos.forEach(nodeGroup => {
            const nodesByYear = d3.group(nodeGroup, d => d.year);
            
            nodesByYear.forEach(yearGroup => {
                
                // 2. Calcular Baricentro (solo si hay colisión temporal)
                if (yearGroup.length > 1) {
                    
                    yearGroup.forEach(node => {
                        let neighborYSum = 0;
                        let neighborCount = 0;
                        
                        const connectedLinks = this.links.filter(link => link.source === node.id || link.target === node.id);

                        connectedLinks.forEach(link => {
                            const otherId = link.source === node.id ? link.target : link.source;
                            const otherNode = this.nodesById.get(otherId);
                            
                            if (otherNode && otherNode.y_coord !== undefined) { 
                                neighborYSum += otherNode.y_coord;
                                neighborCount++;
                            }
                        });
                        // Baricentro: posición ideal Y promediada de los vecinos.
                        node.baricenter = neighborCount > 0 ? neighborYSum / neighborCount : node.y_coord;
                    });
                    
                    // 3. Ordenación y Jittering
                    yearGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
                    
                    const total = yearGroup.length;
                    // Aplicar Jittering (desplazamiento vertical desde la línea central)
                    yearGroup.forEach((node, index) => {
                        node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
                    });
                } else {
                    yearGroup[0].y_jitter = 0;
                }
            });

            // 4. Calcular la Posición Vertical Final y asignarla a node.y_pos
            nodeGroup.forEach(node => {
                // Posición final = Posición central + Jitter (desplazamiento)
                node.y_pos = node.y_coord + node.y_jitter; 
            });
        });
    }

    /**
     * NUEVO: Calcula las cajas mínimas alrededor de los nodos que comparten un prefijo de jerarquía.
     */
    _calculateBoundingBoxes() {
        const boundingBoxes = new Map();
        const allUniquePrefixes = new Set();
        
        // 1. Encontrar todos los prefijos únicos de la jerarquía
        this.nodes.forEach(node => {
            let currentPathParts = [];
            if(node.hierarchy && node.hierarchy.length > 0) {
                 node.hierarchy.forEach(part => {
                    currentPathParts.push(part);
                    allUniquePrefixes.add(currentPathParts.join(this.CONFIG.TEMP_PATH_DELIMITER));
                });
            }
        });

        // 2. Calcular la caja para cada prefijo
        allUniquePrefixes.forEach(fullPath => {
            const pathParts = fullPath.split(this.CONFIG.TEMP_PATH_DELIMITER);
            const primaryCat = pathParts[0];
            const nodesInPrefix = this.nodes.filter(d => d.full_path.startsWith(fullPath));

            if (nodesInPrefix.length > 0) {
                const x_values = nodesInPrefix.map(d => d.x_coord);
                const y_values = nodesInPrefix.map(d => d.y_pos); // Usar d.y_pos (posición final)

                const box = {
                    path: fullPath,
                    name: pathParts[pathParts.length - 1],
                    category: primaryCat,
                    level: pathParts.length,
                    x_min: d3.min(x_values) - this.CONFIG.BOX_PADDING,
                    x_max: d3.max(x_values) + this.CONFIG.BOX_PADDING,
                    y_min: d3.min(y_values) - this.CONFIG.BOX_PADDING,
                    y_max: d3.max(y_values) + this.CONFIG.BOX_PADDING
                };
                box.width = box.x_max - box.x_min;
                box.height = box.y_max - box.y_min;
                boundingBoxes.set(fullPath, box);
            }
        });
        this.boundingBoxes = boundingBoxes;
    }

    /**
     * NUEVO: Dibuja el fondo, los ejes, las líneas de categoría y las Bounding Boxes.
     * Esto asegura que los elementos de fondo se dibujen primero.
     */
    _drawBackgroundAndAxes() {
        const categories = Array.from(this.categoryMap.keys());

        // 1. Ejes Y (Etiquetas de Categoría)
        const yAxis = d3.axisLeft(this.yScale)
            .tickFormat(d => {
                const category = Array.from(this.categoryMap.entries()).find(([key, value]) => value === d);
                return category ? category[0] : '';
            })
            .tickSize(0) 
            .tickPadding(10); 
            
        this.chartArea.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .select(".domain").remove();

        // 2. Ejes X (Tiempo)
        const xAxis = d3.axisBottom(this.xScale)
            .tickFormat(d3.format("d")); 
            
        this.chartArea.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${this.height})`)
            .call(xAxis);

        // 3. Ramas de Categoría (Líneas Horizontales)
        categories.forEach(catName => {
            const y = this.yScale(this.categoryMap.get(catName)); // Posición central Y
            this.chartArea.append("line")
                .attr("x1", 0).attr("y1", y).attr("x2", this.width).attr("y2", y)
                .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
        });

        // 4. Bounding Boxes (solo nivel > 1)
        const sortedBoxes = Array.from(this.boundingBoxes.values()).sort((a, b) => d3.ascending(a.level, b.level) || d3.ascending(a.path, b.path));
        
        sortedBoxes.forEach(box => {
            if (box.level <= 1) return; // Omitir la caja de la categoría principal
            
            if (box.width > 0 && box.height > 0) {
                this.chartArea.append("rect")
                    .attr("x", box.x_min).attr("y", box.y_min)
                    .attr("width", box.width).attr("height", box.height)
                    .attr("fill", "none").attr("stroke", this.colorScale(box.category))
                    .attr("stroke-dasharray", "5,3")
                    .attr("stroke-width", 1)
                    .attr("class", `bbox bbox-level-${box.level}`); 

                this.chartArea.append("text")
                    .attr("x", box.x_min + box.width / 2).attr("y", box.y_min - 5).attr("text-anchor", "middle")
                    .style("font-size", "12px").style("font-style", "italic").style("fill", this.colorScale(box.category))
                    .text(box.name);
            }
        });
    }

    /**
     * RENOMBRADO y MODIFICADO: Renders the visual elements (nodes and links).
     */
    _drawNodesAndLinks() {
        // 1. Dibujar Nodos (Círculos)
        this.chartArea.append("g")
            .attr("class", "nodes")
            .selectAll(".node")
            .data(this.nodes, d => d.id) 
            .enter()
            .append("circle")
            .attr("class", "node")
            .attr("r", 6)
            // CRÍTICO: Usar las coordenadas x_coord y y_pos ya calculadas
            .attr("cx", d => d.x_coord) 
            .attr("cy", d => d.y_pos)  
            .attr("fill", d => this.colorScale(d.hierarchy[0])); 
        
        // 2. Dibujar Enlaces (Links)
        const validLinks = this.links
            .map(link => {
                const sourceNode = this.nodesById.get(link.source);
                const targetNode = this.nodesById.get(link.target);
                
                if (sourceNode && targetNode) {
                    return {
                        source: sourceNode,
                        target: targetNode
                    };
                }
                return null;
            })
            .filter(link => link !== null);

        this.chartArea.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(validLinks, d => d.source.id + '-' + d.target.id)
            .enter()
            .append("line")
            .attr("class", "link")
            // CRÍTICO: Usar las coordenadas x_coord y y_pos ya calculadas
            .attr("x1", d => d.source.x_coord)
            .attr("y1", d => d.source.y_pos)
            .attr("x2", d => d.target.x_coord)
            .attr("y2", d => d.target.y_pos)
            .style("stroke", "#ccc") 
            .style("stroke-width", 1.5);
    }

    /**
     * Main rendering method called from main.js.
     */
    render() {
        if (this.nodes.length === 0) {
            console.warn("Cannot render timeline: No processed data nodes available.");
            return;
        }
        
        this._setupScales();
        this._calculateNodeFinalPositions();
        this._calculateBoundingBoxes();
        this._drawBackgroundAndAxes();
        this._drawNodesAndLinks();

        console.log("Timeline rendered successfully.");
    }
}

// Exportar la clase
export { Timeline };