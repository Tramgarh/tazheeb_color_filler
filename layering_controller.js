// Browser-compatible SVG analyzer
// No external dependencies needed - uses native browser APIs
// layering_controller.js

export function loadSvg(svgText) {
    try {
        let result = [];

        // Parse SVG using browser's built-in DOMParser
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svg = svgDoc.documentElement;

        const paths = Array.from(svg.getElementsByTagName("path"));
        console.log("\n=== ANALYZING SVG ===");
        console.log(`Total paths found: ${paths.length}\n`);

        // Group by fill color first
        const colorGroups = groupPathsByFill(paths, svg);
        console.log(`Color groups found: ${Object.keys(colorGroups).length}\n`);

        console.log("=== CLASSIFICATION RESULTS ===\n");

        let globalOrder = 1;

        // Process each color group
        for (const [fill, groupPaths] of Object.entries(colorGroups)) {
            // Skip groups without fill
            if (fill === '__no_fill__') continue;

            // Extract individual path data
            const pathData = [];
            for (const path of groupPaths) {
                const data = extractGroupProps([path], svg);
                pathData.push({
                    ...data,
                    originalPath: path,
                    fillColor: fill,
                    pathString: path.outerHTML // Get complete path element as string
                });
            }

            // Group by similar size
            const sizeGroups = groupSimilarSizes(pathData);

            // Analyze and classify groups
            const sortedGroups = sizeGroups
                .map(group => ({
                    group,
                    count: group.length,
                    avgSize: group.reduce((sum, p) => sum + p.areaRatio, 0) / group.length,
                    avgDistance: group.reduce((sum, p) => sum + p.distanceFromCenter, 0) / group.length,
                }))
                .sort((a, b) => {
                    // Sort by: 1. Larger size, 2. Fewer elements, 3. Closer to center
                    if (b.avgSize !== a.avgSize) return b.avgSize - a.avgSize;
                    if (a.count !== b.count) return a.count - b.count;
                    return a.avgDistance - b.avgDistance;
                })
                .map((item, idx) => ({
                    ...item,
                    rank: idx + 1,
                    classification: (item.avgSize > 0.001 && item.count <= 15) ? 'Main' : 'Secondary'
                }));

            // Log results
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Fill: ${fill}`);
            console.log(`Total: ${pathData.length} paths | Groups: ${sortedGroups.length}`);
            console.log('─'.repeat(50));

            // Build elements array for this color group
            const elements = sortedGroups.map((item, idx) => {
                const sizePercent = (item.avgSize * 100).toFixed(3);
                const pos = item.avgDistance.toFixed(3);
                
                console.log(`${idx + 1}. [${item.classification}] ${item.count} elem | ${item.avgSize.toExponential(3)} (${sizePercent}%) | pos:${pos}`);

                // Extract path strings from the group
                const pathStrings = item.group.map(p => p.pathString);

                return {
                    id: `elem-${idx + 1}`,
                    fill: fill,
                    pathCount: item.count,
                    elementType: item.classification,
                    paths: pathStrings
                };
            });

            // Create the color group entry
            result.push({
                id: `group_${fill.replace(/[^a-zA-Z0-9]/g, '_')}`,
                name: fill,
                order: globalOrder++,
                visible: true,
                locked: false,
                expanded: false,
                elements: elements
            });

            // Show main elements summary
            const mainElements = sortedGroups.filter(g => g.classification === 'Main');
            if (mainElements.length > 0) {
                console.log(`★ Main Elements: ${mainElements.length} groups`);
            }
        }

        console.log("\n=== ANALYSIS COMPLETE ===\n");
        console.log(`Total color groups: ${result.length}`);

        return result;

    } catch (err) {
        console.error("Error analyzing SVG:", err.message);
        return [];
    }
}

// Helper functions - Browser-compatible bounding box calculation
function getBoundingBoxFromPath(pathElement) {
    // Use native SVG getBBox() method
    try {
        const bbox = pathElement.getBBox();
        return {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
        };
    } catch (e) {
        // Fallback: create temporary SVG to measure
        const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        tempSvg.style.position = "absolute";
        tempSvg.style.visibility = "hidden";
        document.body.appendChild(tempSvg);
        
        const clonedPath = pathElement.cloneNode(true);
        tempSvg.appendChild(clonedPath);
        
        const bbox = clonedPath.getBBox();
        document.body.removeChild(tempSvg);
        
        return {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
        };
    }
}

function combineBoundingBoxes(paths) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const path of paths) {
        const bbox = getBoundingBoxFromPath(path);
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function getSvgMeta(svg) {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
        const [, , width, height] = viewBox.split(/\s+|,/).map(Number);
        return { width, height };
    }
    return {
        width: parseFloat(svg.getAttribute("width")) || 1000,
        height: parseFloat(svg.getAttribute("height")) || 1000,
    };
}

function extractGroupProps(paths, svg) {
    const svgMeta = getSvgMeta(svg);
    const bbox = combineBoundingBoxes(paths);

    const areaRatio = (bbox.width * bbox.height) / (svgMeta.width * svgMeta.height);
    const aspectRatio = bbox.height > 0 ? bbox.width / bbox.height : 1;

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const dx = cx - svgMeta.width / 2;
    const dy = cy - svgMeta.height / 2;
    const maxDist = Math.sqrt((svgMeta.width / 2) ** 2 + (svgMeta.height / 2) ** 2);
    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy) / maxDist;

    return {
        areaRatio,
        aspectRatio,
        distanceFromCenter,
        pathCount: paths.length,
    };
}

function parseSvgStyles(svg) {
    const styles = {};
    const styleTags = Array.from(svg.getElementsByTagName("style"));

    for (const style of styleTags) {
        const css = style.textContent || "";
        const rules = css.match(/([.#][\w-]+)\s*\{[^}]*fill\s*:\s*([^;]+);/gi);
        if (!rules) continue;

        for (const rule of rules) {
            const selector = rule.match(/([.#][\w-]+)/)?.[1];
            const fill = rule.match(/fill\s*:\s*([^;]+)/i)?.[1];
            if (selector && fill) styles[selector] = fill.trim();
        }
    }
    return styles;
}

function groupPathsByFill(paths, svg) {
    const groups = {};
    const styles = parseSvgStyles(svg);

    for (const path of paths) {
        let fill = path.getAttribute("fill");

        const inlineStyle = path.getAttribute("style");
        if (inlineStyle) {
            const match = inlineStyle.match(/fill\s*:\s*([^;]+)/i);
            if (match) fill = match[1];
        }

        if ((!fill || fill === "none") && path.getAttribute("class")) {
            for (const cls of path.getAttribute("class").split(" ")) {
                if (styles["." + cls]) {
                    fill = styles["." + cls];
                    break;
                }
            }
        }

        if ((!fill || fill === "none") && path.getAttribute("id")) {
            const id = "#" + path.getAttribute("id");
            if (styles[id]) fill = styles[id];
        }

        if (!fill || fill === "none") fill = "__no_fill__";

        if (!groups[fill]) groups[fill] = [];
        groups[fill].push(path);
    }

    return groups;
}

function groupSimilarSizes(paths, similarityThreshold = 0.3) {
    // Sort by size
    paths.sort((a, b) => a.areaRatio - b.areaRatio);

    const groups = [];
    let currentGroup = [];

    paths.forEach((path) => {
        if (currentGroup.length === 0) {
            currentGroup.push(path);
        } else {
            const lastInGroup = currentGroup[currentGroup.length - 1];
            const ratio = path.areaRatio / lastInGroup.areaRatio;

            // If sizes are within similarity threshold
            if (ratio < 1 + similarityThreshold && ratio > 1 - similarityThreshold) {
                currentGroup.push(path);
            } else {
                groups.push([...currentGroup]);
                currentGroup = [path];
            }
        }
    });

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}
