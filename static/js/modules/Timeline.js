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
        this.margin = { top: 90, right: 20, bottom: 30, left: 150 };
        this.width = 0; 
        this.height = 0;

        this.svg = null; // The main SVG element
        this.chartArea = null; // The group that contains all visualization elements

        // Scale and Layout Properties
        this.xScale = null;
        this.yScale = null;
        this.colorScale = null;
        this.categoryMap = new Map(); // To map categories to a vertical index
        this.nodesById = new Map(this.nodes.map(d => [d.id, d]));
        this.boundingBoxes = new Map(); // To save subcategory bounding boxes

        // --- CONSTANTS (Brought from timeline_old.js) ---
        this.CONFIG = {
            // Node Sizing
            NODE_RADIUS: 4, 
            MIN_NODE_RADIUS: 4, // Min radius for citation scale (Extracted)
            MAX_NODE_RADIUS: 12, // Max radius for citation scale (Extracted)

            // Layout
            JITTER_AMOUNT: 100, // Maximum vertical distance for dispersal
            BOX_PADDING: 15, // Padding around milestones when calculating the box
            TEMP_PATH_DELIMITER: '|', // Delimiter for hierarchy
            VERTICAL_SPACING_FACTOR: 2.5,  // Increases vertical space between categories (adjust this value if necessary)
            LINK_CURVATURE_STRENGTH: 1, // For link curvature strength (0 = straight, 1 = very curved)

            // Labels
            LABEL_OFFSET: 10, // Horizontal distance of the label from the circle
            LABEL_VERTICAL_ADJUST: 3, // Fine vertical adjustment for the label
        };

        this._calculateVerticalPositions();
        this._initializeSVG();
    }

    /**
     * Initializes the main SVG canvas and the chart area group.
     */
    _initializeSVG() {
        this.svg = d3.select(this.containerSelector);

        // 2. Set initial working values (temporary)
        this.width = 1000; 
        this.height = 600;
        
        const fullWidth = this.width + this.margin.left + this.margin.right;
        const fullHeight = this.height + this.margin.top + this.margin.bottom;

        // 3. Apply initial dimensions to the existing SVG
        this.svg
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .attr("viewBox", `0 0 ${fullWidth} ${fullHeight}`);

        // 4. Create the drawing area group
        this.chartArea = this.svg.append("g")
            .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    }

    /**
     * Calculates the vertical position index (y_pos) for each node based on its primary category.
     * This ensures all nodes in the same primary category share the same baseline Y-position.
     */
    _calculateVerticalPositions() {
        if (this.nodes.length === 0) return;

        // 1. Find all primary categories (First element of 'hierarchy')
        const categories = Array.from(new Set(this.nodes.map(d => d.hierarchy[0]))).sort();
        
        // 2. Create a map of Category -> Index (y_pos)
        // The index is the position of the baseline on the Y-axis.
        categories.forEach((cat, index) => {
            // We use index + 1 to avoid index 0, which can be useful for margins.
            this.categoryMap.set(cat, index + 1); 
        });

        // 3. Assign the base y_pos to each node
        this.nodes.forEach(node => {
            // node.hierarchy[0] is the primary category
            node.y_pos_base = this.categoryMap.get(node.hierarchy[0]);
            
            // Initialize final y_pos. This will be adjusted by the stacking logic.
            node.y_pos = node.y_pos_base; 

            // For bounding box calculation (full paths)
            node.full_path = node.hierarchy.join(this.CONFIG.TEMP_PATH_DELIMITER);
        });
        
        // The total number of vertical baselines is the size of the map.
        this.yDomainSize = this.categoryMap.size;
    }
    
    /**
     * Defines the D3 scales based on the data domain and output range.
     */
    _setupScales() {
        // --- 1. DYNAMIC HEIGHT CALCULATION (Height) ---

        // Category height must be larger to accommodate jittering and bounding boxes
        const categoryHeight = 50 * this.CONFIG.VERTICAL_SPACING_FACTOR; // Use the new factor
        
        // CORRECTION to give more space above (and padding already gives space below)
        this.height = (this.yDomainSize * categoryHeight) + 100; // Base height
        
        // --- 2. DYNAMIC WIDTH CALCULATION (Width) ---
        
        const yearExtent = d3.extent(this.nodes, d => d.year);
        
        // Option A: Width based on Year Range
        const minPixelsPerYear = 50; // 30px per year is a good minimum.
        const startYear = yearExtent[0] || (new Date().getFullYear() - 10);
        const endYear = yearExtent[1] || (new Date().getFullYear());
        const totalYears = endYear - startYear + 1;
        
        let calculatedWidth = totalYears * minPixelsPerYear;
        
        // Option B: Ensure a minimum absolute width if the year range is small
        this.width = Math.max(calculatedWidth, 900); // 900px as minimum absolute width.

        // --- 3. CRITICAL SVG DIMENSION UPDATE ---
        
        const fullWidth = this.width + this.margin.left + this.margin.right;
        const fullHeight = this.height + this.margin.top + this.margin.bottom;

        // Update SVG dimensions created in _initializeSVG!
        this.svg
            .attr("width", fullWidth)
            .attr("height", fullHeight)
            .attr("viewBox", `0 0 ${fullWidth} ${fullHeight}`);

        // --- 4. SCALE DEFINITIONS ---
        // X Scale (Time) - Uses the new this.width
        const yearPadding = (endYear - startYear) * 0.05;
        const paddedDomain = [
            startYear - yearPadding, 
            endYear + yearPadding
        ];

        this.xScale = d3.scaleLinear()
            .domain(paddedDomain) 
            .range([0, this.width]); // Range uses the dynamic width

        // Y Scale (Vertical Position) - Uses the new this.height
        this.yScale = d3.scalePoint() 
            .domain(d3.range(1, this.yDomainSize + 1)) // We extend the domain to add an empty "lane" at the beginning and end
            //.domain(d3.range(0, this.yDomainSize + 2)) // We extend the domain to add an empty "lane" at the beginning and end
            .range([this.height, 50])  // el 50 baja las categorías para dar espacio arriba
            .padding(0.5); 
            
        // Color Scale (remains the same)
        const categories = Array.from(this.categoryMap.keys());
        this.colorScale = d3.scaleOrdinal(d3.schemeCategory10) 
            .domain(categories);

        // 🛑 NEW: Scale for Node Radius (based on Citations)
        const citationsExtent = d3.extent(this.nodes, d => d.citations || 0);

        // Define a radius range: minimum 4px, maximum 12px (adjustable)
        const minRadius = this.CONFIG.MIN_NODE_RADIUS;
        const maxRadius = this.CONFIG.MAX_NODE_RADIUS;

        this.radiusScale = d3.scaleSqrt() // d3.scaleSqrt is better for areas/volumes (circle size)
            .domain(citationsExtent)
            .range([minRadius, maxRadius]);

        // Handle case where there are no citations (extent is [0, 0])
        if (citationsExtent[0] === citationsExtent[1]) {
            this.radiusScale.domain([0, 1]).range([minRadius, minRadius]);
        }
    }
    
    /**
     * Implements Baricenter and Jittering for the final vertical position (d.y_pos).
     * Based on calculateNodePositions from timeline_old.js.
     */
    _calculateNodeFinalPositions() {
        const { JITTER_AMOUNT } = this.CONFIG;

        // 1. Calculate initial coordinates (x_coord, y_coord)
        this.nodes.forEach(node => {
            node.x_coord = this.xScale(node.year); 
            node.y_coord = this.yScale(node.y_pos_base); // Center line position
        });

        const nodesByYPos = d3.group(this.nodes, d => d.y_pos_base);

        nodesByYPos.forEach(nodeGroup => {
            const nodesByYear = d3.group(nodeGroup, d => d.year);
            
            nodesByYear.forEach(yearGroup => {
                
                // 2. Calculate Baricenter (only if there is temporal collision)
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
                        // Baricenter: averaged ideal Y position of neighbors.
                        node.baricenter = neighborCount > 0 ? neighborYSum / neighborCount : node.y_coord;
                    });
                    
                    // 3. Sorting and Jittering
                    yearGroup.sort((a, b) => d3.ascending(a.baricenter, b.baricenter));
                    
                    const total = yearGroup.length;
                    // Apply Jittering (vertical displacement from the center line)
                    yearGroup.forEach((node, index) => {
                        node.y_jitter = JITTER_AMOUNT * (index - (total - 1) / 2);
                    });
                } else {
                    yearGroup[0].y_jitter = 0;
                }
            });

            // 4. Calculate the Final Vertical Position and assign it to node.y_pos
            nodeGroup.forEach(node => {
                // Final position = Center position + Jitter (displacement)
                node.y_pos = node.y_coord + node.y_jitter; 
            });
        });
    }

    /**
     * NEW: Calculates the minimum bounding boxes around nodes that share a hierarchy prefix.
     */
    _calculateBoundingBoxes() {
        const boundingBoxes = new Map();
        const allUniquePrefixes = new Set();
        
        // 1. Find all unique hierarchy prefixes
        this.nodes.forEach(node => {
            let currentPathParts = [];
            if(node.hierarchy && node.hierarchy.length > 0) {
                 node.hierarchy.forEach(part => {
                    currentPathParts.push(part);
                    allUniquePrefixes.add(currentPathParts.join(this.CONFIG.TEMP_PATH_DELIMITER));
                });
            }
        });

        // 2. Calculate the box for each prefix
        allUniquePrefixes.forEach(fullPath => {
            const pathParts = fullPath.split(this.CONFIG.TEMP_PATH_DELIMITER);
            const primaryCat = pathParts[0];
            const nodesInPrefix = this.nodes.filter(d => d.full_path.startsWith(fullPath));

            if (nodesInPrefix.length > 0) {
                const x_values = nodesInPrefix.map(d => d.x_coord);
                const y_values = nodesInPrefix.map(d => d.y_pos); // Use d.y_pos (final position)

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
     * NEW: Draws the background, axes, category lines, and Bounding Boxes.
     * This ensures that background elements are drawn first.
     */
    _drawBackgroundAndAxes() {
        const categories = Array.from(this.categoryMap.keys());

        // 1. Y Axis (Category Labels)
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

        // 2. X Axis (Time: Top & Bottom)
        const xAxisBottom = d3.axisBottom(this.xScale)
            .tickFormat(d3.format("d"));

        const xAxisTop = d3.axisTop(this.xScale)
            .tickFormat(d3.format("d"));
                
        this.chartArea.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${this.height})`)
            .call(xAxisBottom);
        
        this.chartArea.append("g")
            .attr("class", "x-axis x-axis-top")
            .attr("transform", `translate(0, -20)`)
            .call(xAxisTop);

        // 3. Category Branches (Horizontal Lines)
        categories.forEach(catName => {
            const y = this.yScale(this.categoryMap.get(catName)); // Center Y position
            this.chartArea.append("line")
                .attr("x1", 0).attr("y1", y).attr("x2", this.width).attr("y2", y)
                .attr("stroke", "#bdc3c7").attr("stroke-dasharray", "4,4");
        });

        // 4. Bounding Boxes (level > 1 only)
        const sortedBoxes = Array.from(this.boundingBoxes.values()).sort((a, b) => d3.ascending(a.level, b.level) || d3.ascending(a.path, b.path));
        
        sortedBoxes.forEach(box => {
            if (box.level <= 1) return; // Skip the primary category box
            
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
     * ⭐ NUEVO: Define un generador de rutas D3 para enlaces curvos (Bézier Cuadrática).
     */
    _linkPathGenerator(d) {
        const x1 = d.source.x_coord;
        const y1 = d.source.y_pos;
        const x2 = d.target.x_coord;
        const y2 = d.target.y_pos;
        
        // Punto de control para la curva (se encuentra en el centro de X)
        const x_mid = (x1 + x2) / 2;
        
        // Desplazamiento vertical para crear la curvatura.
        // Si la diferencia vertical es pequeña, la curva será sutil.
        const y_diff = Math.abs(y2 - y1);
        const curvatureOffset = y_diff * this.CONFIG.LINK_CURVATURE_STRENGTH; 
        
        // El punto de control se desplaza ligeramente en Y dependiendo de si el enlace sube o baja.
        // Nota: El offset se aplica para crear una curva 'hacia el centro' o 'alejándose'. 
        const controlY = (y1 < y2) ? y1 + curvatureOffset : y1 - curvatureOffset;
        
        // Generador de ruta (Quadratic Bézier Curve: M x1 y1 Q xc yc x2 y2)
        return `M ${x1} ${y1} Q ${x_mid} ${controlY} ${x2} ${y2}`;
    }

    /**
     * ⭐ NUEVO: Dibuja los enlaces como paths curvos.
     */
    _drawLinks() {
        // 1. Preparar datos de enlaces
        const validLinks = this.links
            .map(link => {
                const sourceNode = this.nodesById.get(link.source);
                const targetNode = this.nodesById.get(link.target);
                
                if (sourceNode && targetNode) {
                    return { source: sourceNode, target: targetNode };
                }
                return null;
            })
            .filter(link => link !== null);

        // 2. Dibujar enlaces como paths
        this.chartArea.append("g")
            .attr("class", "links")
            .selectAll("path")
            .data(validLinks, d => d.source.id + '-' + d.target.id)
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("d", d => this._linkPathGenerator(d)) // Usa el nuevo generador de path curvo
            .style("fill", "none") 
            .style("stroke", "#ccc") 
            .style("stroke-width", 1.5)
            .lower(); // Mueve los enlaces al fondo de la visualización
        
        // COMENTARIO DE IMPLEMENTACIÓN PARA LA CURVA CONDICIONAL:
        // Para implementar la curva *solo* cuando un enlace cruza un nodo, 
        // se requiere una función de detección de intersección (Link-Circle Intersection)
        // que debe ejecutarse por cada enlace con todos los nodos. 
        // Si se detecta una intersección, el path del enlace debería modificarse
        // para saltar (jump) usando múltiples segmentos o una curva de mayor orden.
    }

    /**
     * ⭐ NUEVO: Dibuja los nodos y etiquetas.
     */
    _drawNodes() {
        const nodesGroup = this.chartArea.append("g").attr("class", "nodes");
        
        // 1. Draw Nodes (Circles)
        const nodeCircles = nodesGroup.selectAll(".node")
            .data(this.nodes, d => d.id) 
            .enter()
            .append("circle")
            .attr("class", "node")
            .attr("r", d => this.radiusScale(d.citations || 0))
            .attr("cx", d => d.x_coord) 
            .attr("cy", d => d.y_pos)  
            .attr("fill", d => this.colorScale(d.hierarchy[0]))
            .style("cursor", "pointer");

        // Tooltip Events
        nodeCircles.on("mouseover", (event, d) => this._showTooltip(event, d))
            .on("mousemove", (event) => d3.select("#custom-tooltip")
                                             .style("left", (event.pageX + 10) + "px")
                                             .style("top", (event.pageY - 20) + "px"))
            .on("mouseout", () => this._hideTooltip())

        // 2. ADD INTERACTIVITY (Click)
        nodeCircles.on("click", (event, d) => { 
            if (typeof window.showNodeDetails === 'function') {
                window.showNodeDetails(d);
            } else {
                console.error("ERROR: window.showNodeDetails(data) is not defined. Ensure it is imported and made global in main.js.");
            }
        });

        // 3. Draw Labels (Titles)
        nodesGroup.selectAll(".node-label")
            .data(this.nodes, d => d.id) 
            .enter()
            .append("text") 
            .attr("class", "node-label")
            .attr("x", d => d.x_coord) 
            // Usa el radio dinámico de la escala para evitar superposición con círculos grandes
            .attr("y", d => d.y_pos - this.radiusScale(d.citations || 0) - this.CONFIG.LABEL_VERTICAL_ADJUST) 
            .text(d => d.title || `Node ${d.id}`) 
            .style("font-size", "10px")
            .style("fill", "#555")
            .style("pointer-events", "none")
            .style("text-anchor", "start"); // Alinear el texto al inicio (center para centrar)
    }

    /**
     * Shows the custom tooltip with node content.
     * @param {Object} event - The mouse event.
     * @param {Object} d - The node data.
     */
    _showTooltip(event, d) {
        const tooltip = d3.select("#custom-tooltip");
        
        // Tooltip content (similar to the old code)
        const categoryPath = d.hierarchy ? d.hierarchy.join(' ➔ ') : '';
        const yearText = d.year ? `(${d.year})` : '';
        const citationsText = d.citations ? `${d.citations} citations` : 'No citation data';
        // <small class="text-muted">${categoryPath} ${yearText}</small>
        tooltip.html(`
            <div style="font-size: 14px;">
                <strong>${d.longtitle || d.title}</strong> ${yearText}
            </div>
            <small class="text-muted">${categoryPath}</small>
            <p class="mt-1 mb-0 small fw-bold">${citationsText}</p>
        `);

        // Position: Move the tooltip near the cursor
        tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 20) + "px")
            .style("opacity", 0.95);
    }

    /**
     * Hides the tooltip.
     */
    _hideTooltip() {
        d3.select("#custom-tooltip").style("opacity", 0);
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
        this._drawLinks();
        this._drawNodes();

        console.log("Timeline rendered successfully.");
    }
}

// Export the class
export { Timeline };