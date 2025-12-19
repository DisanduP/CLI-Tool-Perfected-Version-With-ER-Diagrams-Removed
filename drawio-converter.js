/**
 * Draw.io XML Converter
 * Converts parsed Mermaid diagrams to Draw.io XML format
 */

const { SHAPE_MAPPINGS } = require('./mermaid-parser');
const dagre = require('dagre');

/**
 * Generate a unique ID for Draw.io elements
 */
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculate node positions using Dagre for better layout
 */
function calculatePositions(nodes, direction, edges) {
  const positions = new Map();
  const nodeWidth = 140;
  const nodeHeight = 50;

  // Create a new directed graph
  const g = new dagre.graphlib.Graph();

  // Set default edge label
  g.setDefaultEdgeLabel(() => ({}));

  // Set graph direction
  if (direction === 'LR') {
    g.setGraph({ rankdir: 'LR' });
  } else if (direction === 'RL') {
    g.setGraph({ rankdir: 'RL' });
  } else if (direction === 'BT') {
    g.setGraph({ rankdir: 'BT' });
  } else {
    g.setGraph({ rankdir: 'TB' }); // TD
  }

  // Add nodes to the graph
  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight, label: node.label });
  });

  // Add edges to the graph
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Run the layout
  dagre.layout(g);

  // Extract positions and edge points
  const edgePoints = new Map();
  nodes.forEach((node) => {
    const nodeInfo = g.node(node.id);
    positions.set(node.id, {
      x: nodeInfo.x - nodeWidth / 2, // Center the node
      y: nodeInfo.y - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight
    });
  });

  // Extract edge points for routing
  edges.forEach((edge) => {
    const edgeInfo = g.edge(edge.source, edge.target);
    if (edgeInfo.points) {
      edgePoints.set(`${edge.source}-${edge.target}`, edgeInfo.points);
    }
  });

  return { positions, edgePoints };
}

/**
 * Generate Draw.io style string for a node
 */
function getNodeStyle(node) {
  let style = node.style || SHAPE_MAPPINGS.rectangle.style;
  const fillColor = node.fillColor || '#dae8fc';
  const strokeColor = node.strokeColor || '#6c8ebf';
  
  return `${style}fillColor=${fillColor};strokeColor=${strokeColor};`;
}

/**
 * Generate edge style string
 */
function getEdgeStyle(edge, sourceNode, targetNode, positions) {
  // Clean orthogonal lines - professional flowchart look
  let style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;';
  
  if (edge.arrowType) {
    if (edge.arrowType.type === 'dashed') {
      style += 'dashed=1;';
    }
    if (edge.arrowType.arrow === 'none') {
      style += 'endArrow=none;';
    } else {
      style += 'endArrow=classic;';
    }
  } else {
    style += 'endArrow=classic;';
  }
  
  // Only one arrow at the end, none at start
  style += 'startArrow=none;';
  
  return style;
}

/**
 * Convert parsed diagram to Draw.io XML
 */
function convertToDrawio(parsedDiagram, options = {}) {
  const { name = 'Converted Diagram' } = options;
  const diagramId = generateId();
  const direction = parsedDiagram.direction || 'TD';
  
  // For flowcharts, automatically add Start and Stop nodes if missing
  let nodes = [...parsedDiagram.nodes];
  let edges = [...parsedDiagram.edges];
  
  if (parsedDiagram.type === 'flowchart') {
    // Build adjacency maps to find start and end nodes
    const outEdges = new Map();
    const inEdges = new Map();
    
    nodes.forEach((node) => {
      outEdges.set(node.id, []);
      inEdges.set(node.id, []);
    });
    
    edges.forEach((edge) => {
      if (outEdges.has(edge.source)) {
        outEdges.get(edge.source).push(edge.target);
      }
      if (inEdges.has(edge.target)) {
        inEdges.get(edge.target).push(edge.source);
      }
    });
    
    // Find nodes with no incoming edges (potential start nodes)
    const startNodes = nodes.filter((node) => inEdges.get(node.id).length === 0);
    // Find nodes with no outgoing edges (potential end nodes)
    const endNodes = nodes.filter((node) => outEdges.get(node.id).length === 0);
    
    // Check if Start node exists
    const hasStartNode = nodes.some((node) => 
      node.id === 'Start' || node.label.toLowerCase() === 'start'
    );
    
    // Check if Stop/End node exists
    const hasStopNode = nodes.some((node) => 
      node.id === 'Stop' || node.id === 'End' || 
      node.label.toLowerCase() === 'stop' || node.label.toLowerCase() === 'end'
    );
    
    // Add Start node if missing
    if (!hasStartNode && startNodes.length > 0) {
      const startNode = {
        id: 'Start',
        label: 'Start',
        shape: 'stadium',
        style: SHAPE_MAPPINGS.stadium.style,
        fillColor: SHAPE_MAPPINGS.stadium.fillColor,
        strokeColor: SHAPE_MAPPINGS.stadium.strokeColor,
      };
      nodes.unshift(startNode); // Add at beginning
      
      // Connect Start to first process node
      startNodes.forEach((processNode) => {
        edges.unshift({
          id: `e_start_${processNode.id}`,
          source: 'Start',
          target: processNode.id,
          label: '',
          arrowType: null,
        });
      });
    }
    
    // Add Stop node if missing
    if (!hasStopNode && endNodes.length > 0) {
      const stopNode = {
        id: 'Stop',
        label: 'Stop',
        shape: 'stadium',
        style: SHAPE_MAPPINGS.stadium.style,
        fillColor: '#f8cecc', // Red color for stop
        strokeColor: '#b85450',
      };
      nodes.push(stopNode); // Add at end
      
      // Connect all end nodes to Stop
      endNodes.forEach((processNode) => {
        edges.push({
          id: `e_${processNode.id}_stop`,
          source: processNode.id,
          target: 'Stop',
          label: '',
          arrowType: null,
        });
      });
    }
  }
  
  // Calculate positions
  const { positions, edgePoints } = calculatePositions(
    nodes,
    direction,
    edges
  );
  
  // Build nodes XML - adjust size based on shape type
  const nodesXml = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 340, y: 40, width: 140, height: 50 };
    const style = getNodeStyle(node);
    const label = escapeXml(node.label);
    
    // Make diamonds bigger to fit text (they display text in a smaller area)
    let width = pos.width;
    let height = pos.height;
    if (node.shape === 'diamond') {
      width = Math.max(160, label.length * 8);
      height = 80;
    }
    
    return `        <mxCell id="${node.id}" value="${label}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>`;
  }).join('\n');
  
  // Build edges XML - filter out duplicate edges and add smart routing
  const seenEdges = new Set();
  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));
  
  const edgesXml = edges
    .filter((edge) => {
      const key = `${edge.source}->${edge.target}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    })
    .map((edge) => {
      const sourcePos = positions.get(edge.source);
      const targetPos = positions.get(edge.target);
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      let style = getEdgeStyle(edge);
      const label = edge.label ? escapeXml(edge.label) : '';
      
      let exitX = 0.5, exitY = 1, entryX = 0.5, entryY = 0;
      let waypoints = [];
      
      // Use Dagre's edge points for better routing
      const edgeKey = `${edge.source}-${edge.target}`;
      const dagrePoints = edgePoints.get(edgeKey);
      if (dagrePoints && dagrePoints.length > 2) {
        // Use intermediate points as waypoints
        waypoints = dagrePoints.slice(1, -1).map(p => ({ x: p.x, y: p.y }));
        
        // Set exit/entry based on first and last points
        const firstPoint = dagrePoints[1];
        const lastPoint = dagrePoints[dagrePoints.length - 2];
        
        exitX = Math.max(0, Math.min(1, (firstPoint.x - sourcePos.x) / (sourceNode?.shape === 'diamond' ? 160 : 140)));
        exitY = Math.max(0, Math.min(1, (firstPoint.y - sourcePos.y) / (sourceNode?.shape === 'diamond' ? 80 : 50)));
        entryX = Math.max(0, Math.min(1, (lastPoint.x - targetPos.x) / (targetNode?.shape === 'diamond' ? 160 : 140)));
        entryY = Math.max(0, Math.min(1, (lastPoint.y - targetPos.y) / (targetNode?.shape === 'diamond' ? 80 : 50)));
      } else {
        // Original calculation
        // Calculate relative positions to determine exit/entry points
        if (sourcePos && targetPos) {
          const sourceWidth = sourceNode?.shape === 'diamond' ? 160 : 140;
          const sourceHeight = sourceNode?.shape === 'diamond' ? 80 : 50;
          const targetWidth = targetNode?.shape === 'diamond' ? 160 : 140;
          const targetHeight = targetNode?.shape === 'diamond' ? 80 : 50;
          
          const sourceCenterX = sourcePos.x + sourceWidth / 2;
          const sourceCenterY = sourcePos.y + sourceHeight / 2;
          const targetCenterX = targetPos.x + targetWidth / 2;
          const targetCenterY = targetPos.y + targetHeight / 2;
          
          const dx = targetCenterX - sourceCenterX;
          const dy = targetCenterY - sourceCenterY;
          
          // For diamond (decision) nodes, route left/right exits properly
          if (sourceNode && sourceNode.shape === 'diamond') {
            if (dx > 80) {
              // Target is to the right - exit from right side of diamond
              exitX = 1; exitY = 0.5;
              // Enter from TOP of target (not left side) to avoid arrow going inside
              entryX = 0.5; entryY = 0;
              
              // Route: go right from diamond, then down to top of target
              const exitPointX = sourcePos.x + sourceWidth;
              const exitPointY = sourceCenterY;
              
              waypoints.push({ x: targetCenterX, y: exitPointY });
              
            } else if (dx < -80) {
              // Target is to the left - exit from left side
              exitX = 0; exitY = 0.5;
              // Enter from TOP of target
              entryX = 0.5; entryY = 0;
              
              // Route: go left from diamond, then down to top of target
              const exitPointX = sourcePos.x;
              const exitPointY = sourceCenterY;
              
              waypoints.push({ x: targetCenterX, y: exitPointY });
              
            } else if (dy < -20) {
              // Back edge from diamond - route around right side
              exitX = 1; exitY = 0.5;
              entryX = 1; entryY = 0.5;
              
              const rightOffset = 60;
              const sourceRightX = sourcePos.x + sourceWidth + rightOffset;
              const targetRightX = targetPos.x + targetWidth + rightOffset;
              const routeX = Math.max(sourceRightX, targetRightX);
              
              waypoints.push({ x: routeX, y: sourceCenterY });
              waypoints.push({ x: routeX, y: targetCenterY });
              
            } else {
              // Target is mostly below - exit from bottom, enter from top
              exitX = 0.5; exitY = 1;
              entryX = 0.5; entryY = 0;
            }
          } else {
            // Non-diamond nodes - simple top-to-bottom or side routing
            if (dy > 20) {
              // Target is below
              exitX = 0.5; exitY = 1;
              entryX = 0.5; entryY = 0;
            } else if (dy < -20) {
              // Target is above - this is a BACK-EDGE (loop)
              // Route around the right side to make it visible
              exitX = 1; exitY = 0.5;  // Exit from right side
              entryX = 1; entryY = 0.5; // Enter from right side of target
              
              // Add waypoints to route around the right side
              const rightOffset = 60; // How far right to route
              const sourceRightX = sourcePos.x + (sourceNode?.shape === 'diamond' ? 160 : 140) + rightOffset;
              const targetRightX = targetPos.x + (targetNode?.shape === 'diamond' ? 160 : 140) + rightOffset;
              const routeX = Math.max(sourceRightX, targetRightX);
              
              waypoints.push({ x: routeX, y: sourceCenterY });
              waypoints.push({ x: routeX, y: targetCenterY });
            } else if (dx > 0) {
              // Target is to the right
              exitX = 1; exitY = 0.5;
              entryX = 0; entryY = 0.5;
            } else {
              // Target is to the left
              exitX = 0; exitY = 0.5;
              entryX = 1; entryY = 0.5;
            }
          }
        }
      }
      
      style += `exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;`;
      style += `entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;`;
      
      // Build waypoints XML if we have any
      let waypointsXml = '';
      if (waypoints.length > 0) {
        waypointsXml = `
            <Array as="points">
${waypoints.map(wp => `              <mxPoint x="${Math.round(wp.x)}" y="${Math.round(wp.y)}"/>`).join('\n')}
            </Array>`;
      }
      
      // Add label offset - different offsets for decision branches
      let labelOffset = '';
      if (label) {
        // Check if this is a decision branch (source has multiple outgoing edges)
        const sourceEdges = edges.filter(e => e.source === edge.source && e.label);
        const edgeIndex = sourceEdges.findIndex(e => e.id === edge.id);
        
        if (sourceEdges.length > 1) {
          // Multiple labeled edges from same source - space them out
          const offsets = [
            { x: 0, y: -10 },    // First branch
            { x: 0, y: 10 },     // Second branch  
            { x: -20, y: 0 },    // Third branch (if needed)
            { x: 20, y: 0 }      // Fourth branch (if needed)
          ];
          const offset = offsets[edgeIndex] || offsets[0];
          labelOffset = `\n            <mxPoint as="offset" x="${offset.x}" y="${offset.y}"/>`;
        } else {
          // Single edge - use default offset
          labelOffset = '\n            <mxPoint as="offset" x="0" y="-10"/>';
        }
      }
    
    return `        <mxCell id="${edge.id}" value="${label}" style="${style}" edge="1" parent="1" source="${edge.source}" target="${edge.target}">
          <mxGeometry relative="1" as="geometry">${waypointsXml}${labelOffset}
          </mxGeometry>
        </mxCell>`;
  }).join('\n');
  
  // Build subgraphs XML (as groups)
  let subgraphsXml = '';
  if (parsedDiagram.subgraphs && parsedDiagram.subgraphs.length > 0) {
    subgraphsXml = parsedDiagram.subgraphs.map((subgraph, index) => {
      // Calculate bounding box for subgraph
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      subgraph.nodes.forEach((nodeId) => {
        const pos = positions.get(nodeId);
        if (pos) {
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
          maxX = Math.max(maxX, pos.x + pos.width);
          maxY = Math.max(maxY, pos.y + pos.height);
        }
      });
      
      const padding = 20;
      const x = minX - padding;
      const y = minY - padding - 30; // Extra space for label
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2 + 30;
      
      return `        <mxCell id="sg${index}" value="${escapeXml(subgraph.label)}" style="swimlane;startSize=30;fillColor=#f5f5f5;strokeColor=#666666;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>`;
    }).join('\n');
  }
  
  // Assemble final XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="BMAD-CLI" version="21.0.0">
  <diagram name="${escapeXml(name)}" id="${diagramId}">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${subgraphsXml}
${nodesXml}
${edgesXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  
  return xml;
}

/**
 * Convert sequence diagram to Draw.io
 */
function convertSequenceToDrawio(parsedDiagram, options = {}) {
  const { name = 'Sequence Diagram' } = options;
  const diagramId = generateId();
  
  const participants = parsedDiagram.participants || parsedDiagram.nodes;
  const messages = parsedDiagram.messages || [];
  
  const participantWidth = 120;
  const participantHeight = 40;
  const horizontalGap = 180;
  const verticalGap = 60;
  const startX = 100;
  const startY = 40;
  const lifelineHeight = (messages.length + 2) * verticalGap;
  
  // Position participants
  const positions = new Map();
  participants.forEach((p, index) => {
    positions.set(p.id, {
      x: startX + index * horizontalGap,
      y: startY,
      width: participantWidth,
      height: participantHeight,
    });
  });
  
  // Build participants XML
  const participantsXml = participants.map((p) => {
    const pos = positions.get(p.id);
    const style = p.isActor
      ? 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;'
      : 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;';
    
    return `        <mxCell id="${p.id}" value="${escapeXml(p.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry"/>
        </mxCell>`;
  }).join('\n');
  
  // Build lifelines XML
  const lifelinesXml = participants.map((p) => {
    const pos = positions.get(p.id);
    const lifelineX = pos.x + pos.width / 2;
    const lifelineY = pos.y + pos.height;
    
    return `        <mxCell id="${p.id}_lifeline" value="" style="endArrow=none;dashed=1;html=1;strokeWidth=1;strokeColor=#999999;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${lifelineX}" y="${lifelineY}" as="sourcePoint"/>
            <mxPoint x="${lifelineX}" y="${lifelineY + lifelineHeight}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>`;
  }).join('\n');
  
  // Build messages XML
  const messagesXml = messages.map((msg, index) => {
    const fromPos = positions.get(msg.from);
    const toPos = positions.get(msg.to);
    if (!fromPos || !toPos) return '';
    
    const y = startY + participantHeight + (index + 1) * verticalGap;
    const style = msg.type === 'dashed'
      ? 'html=1;dashed=1;endArrow=open;'
      : 'html=1;endArrow=block;endFill=1;';
    
    return `        <mxCell id="msg${index}" value="${escapeXml(msg.message)}" style="${style}" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${fromPos.x + fromPos.width / 2}" y="${y}" as="sourcePoint"/>
            <mxPoint x="${toPos.x + toPos.width / 2}" y="${y}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>`;
  }).filter(Boolean).join('\n');
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="BMAD-CLI" version="21.0.0">
  <diagram name="${escapeXml(name)}" id="${diagramId}">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${participantsXml}
${lifelinesXml}
${messagesXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  
  return xml;
}

/**
 * Convert mindmap to Draw.io
 */
function convertMindmapToDrawio(parsedDiagram, options = {}) {
  const { name = 'Mindmap' } = options;
  const diagramId = generateId();

  const nodes = parsedDiagram.nodes;
  const edges = parsedDiagram.edges;

  // Build parent-child relationships
  const children = new Map();
  const parent = new Map();
  edges.forEach((edge) => {
    if (!children.has(edge.source)) {
      children.set(edge.source, []);
    }
    children.get(edge.source).push(edge.target);
    parent.set(edge.target, edge.source);
  });

  // Find root node (node with no parent)
  const rootNode = nodes.find((n) => !parent.has(n.id));
  
  // Calculate positions using a tree layout
  const positions = new Map();
  const nodeWidth = 120;
  const nodeHeight = 36;
  const levelGap = 200; // Horizontal gap between levels
  const siblingGap = 15; // Vertical gap between siblings

  // Calculate subtree heights for proper spacing
  function getSubtreeHeight(nodeId) {
    const nodeChildren = children.get(nodeId) || [];
    if (nodeChildren.length === 0) {
      return nodeHeight;
    }
    let totalHeight = 0;
    nodeChildren.forEach((childId) => {
      totalHeight += getSubtreeHeight(childId) + siblingGap;
    });
    return Math.max(totalHeight - siblingGap, nodeHeight);
  }

  // Position nodes recursively
  function positionNode(nodeId, x, yStart, yEnd) {
    const yCenter = (yStart + yEnd) / 2;
    
    positions.set(nodeId, {
      x: Math.round(x / 10) * 10,
      y: Math.round((yCenter - nodeHeight / 2) / 10) * 10,
      width: nodeWidth,
      height: nodeHeight,
    });

    const nodeChildren = children.get(nodeId) || [];
    if (nodeChildren.length === 0) return;

    // Calculate total height needed for children
    const childHeights = nodeChildren.map((childId) => getSubtreeHeight(childId));
    const totalChildHeight = childHeights.reduce((sum, h) => sum + h + siblingGap, 0) - siblingGap;

    // Position children
    let currentY = yCenter - totalChildHeight / 2;
    nodeChildren.forEach((childId, index) => {
      const childHeight = childHeights[index];
      positionNode(
        childId,
        x + levelGap,
        currentY,
        currentY + childHeight
      );
      currentY += childHeight + siblingGap;
    });
  }

  // Start positioning from root
  if (rootNode) {
    const totalHeight = getSubtreeHeight(rootNode.id);
    const startY = 50;
    positionNode(rootNode.id, 50, startY, startY + totalHeight);
  }

  // Build nodes XML
  const nodesXml = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 100, y: 100, width: nodeWidth, height: nodeHeight };
    const style = `${node.style}fillColor=${node.fillColor};strokeColor=${node.strokeColor};fontStyle=1;fontSize=11;`;
    const label = escapeXml(node.label);

    return `        <mxCell id="${node.id}" value="${label}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry"/>
        </mxCell>`;
  }).join('\n');

  // Build edges XML - use exitX/exitY and entryX/entryY to connect at box edges
  const edgesXml = edges.map((edge) => {
    // Exit from right side of source (x=1), enter left side of target (x=0)
    // Y position at middle (y=0.5)
    return `        <mxCell id="${edge.id}" value="" style="edgeStyle=orthogonalEdgeStyle;curved=1;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeWidth=2;strokeColor=#666666;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="${edge.source}" target="${edge.target}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`;
  }).join('\n');

  // Calculate canvas size based on positions
  let maxX = 800, maxY = 600;
  positions.forEach((pos) => {
    maxX = Math.max(maxX, pos.x + pos.width + 100);
    maxY = Math.max(maxY, pos.y + pos.height + 100);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="BMAD-CLI" version="21.0.0">
  <diagram name="${escapeXml(name)}" id="${diagramId}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.max(1100, maxX)}" pageHeight="${Math.max(850, maxY)}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${nodesXml}
${edgesXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  return xml;
}

/**
 * Main conversion function - detects diagram type and converts
 */
function toDrawio(parsedDiagram, options = {}) {
  switch (parsedDiagram.type) {
    case 'sequence':
      return convertSequenceToDrawio(parsedDiagram, options);
    case 'mindmap':
      return convertMindmapToDrawio(parsedDiagram, options);
    case 'flowchart':
    default:
      return convertToDrawio(parsedDiagram, options);
  }
}

module.exports = {
  toDrawio,
  convertToDrawio,
  convertSequenceToDrawio,
  convertMindmapToDrawio,
  escapeXml,
};
