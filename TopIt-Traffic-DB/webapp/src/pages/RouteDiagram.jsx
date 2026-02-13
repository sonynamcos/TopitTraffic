import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRoutes, saveRoutes, getIntersection, registerDat } from '../api/client';

const NODE_R = 8;
const LABEL_Y = 14;
const LINE_COLOR = '#4a9ead';
const LINE_COLOR_HOVER = '#6fc4d4';
const LINE_WIDTH = 3;
const EDGE_HIT_WIDTH = 14; // invisible hit area for clicking edges

export default function RouteDiagram() {
  const [graph, setGraph] = useState(null); // { nodes, edges }
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // Selection
  const [selNode, setSelNode] = useState(null);   // node id
  const [selEdge, setSelEdge] = useState(null);    // edge index
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // Popup (view mode)
  const [popup, setPopup] = useState(null);

  // Drag
  const [dragId, setDragId] = useState(null);

  // Pan/Zoom
  const [viewBox, setViewBox] = useState({ x: -50, y: -50, w: 2600, h: 1800 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  // Linking mode: click node A → click node B → create edge
  const [linkFrom, setLinkFrom] = useState(null);

  // DAT upload state
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { type: 'success'|'warning'|'error', text }
  const fileInputRef = useRef(null);

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { loadGraph(); }, []);

  // Non-passive wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      setViewBox(prev => {
        const cw = Math.max(300, Math.min(5200, prev.w * factor));
        const ch = Math.max(200, Math.min(3600, prev.h * factor));
        return { x: prev.x + (prev.w - cw) * mx, y: prev.y + (prev.h - ch) * my, w: cw, h: ch };
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [graph]);

  // Close search on outside click
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function loadGraph() {
    try {
      const data = await getRoutes();
      let g;
      if (data.nodes) {
        g = data;
      } else if (data.routes) {
        const nodeMap = new Map();
        const edgeSet = new Set();
        const edges = [];
        for (const route of data.routes) {
          for (const ctrl of route.controllers) {
            if (!nodeMap.has(ctrl.id)) nodeMap.set(ctrl.id, { id: ctrl.id, name: ctrl.name, x: ctrl.x, y: ctrl.y });
          }
          for (let i = 0; i < route.controllers.length - 1; i++) {
            const a = route.controllers[i].id, b = route.controllers[i + 1].id;
            const key = [a, b].sort().join('|');
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ from: a, to: b }); }
          }
        }
        g = { version: '2.0', format: 'graph', nodes: Array.from(nodeMap.values()), edges };
      } else {
        g = { version: '2.0', format: 'graph', nodes: [], edges: [] };
      }
      autoAlign(g);
      setGraph(g);
    } catch (e) { setError(e.message); }
  }

  // ── Auto-align: straighten chains and snap branches to 90° ──
  function autoAlign(g) {
    if (!g.nodes.length) return;

    // Build adjacency + node map
    const adj = {};
    const nMap = {};
    for (const n of g.nodes) { adj[n.id] = []; nMap[n.id] = n; }
    for (const e of g.edges) {
      if (adj[e.from] && adj[e.to]) {
        adj[e.from].push(e.to);
        adj[e.to].push(e.from);
      }
    }

    // ── Step 1: Find chains (sequences where internal nodes have degree 2) ──
    const usedEdges = new Set();
    const chains = [];

    for (const n of g.nodes) {
      if (adj[n.id].length === 2) continue; // skip internal chain nodes
      for (const nb of adj[n.id]) {
        const key = [n.id, nb].sort().join('|');
        if (usedEdges.has(key)) continue;

        const chain = [n.id];
        let cur = nb, prev = n.id;
        while (adj[cur]?.length === 2) {
          chain.push(cur);
          usedEdges.add([prev, cur].sort().join('|'));
          const next = adj[cur].find(x => x !== prev);
          prev = cur;
          cur = next;
        }
        chain.push(cur);
        usedEdges.add([prev, cur].sort().join('|'));

        if (chain.length >= 3) chains.push(chain);
      }
    }

    // ── Step 2: Align chains ──
    const ALIGN_THRESHOLD = 50; // px difference to consider "roughly aligned"
    for (const chain of chains) {
      const nodes = chain.map(id => nMap[id]);
      const xs = nodes.map(n => n.x);
      const ys = nodes.map(n => n.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);

      if (spanX > spanY * 1.5 && spanY < ALIGN_THRESHOLD * chain.length) {
        // Horizontal chain → align Y to median
        const sorted = [...ys].sort((a, b) => a - b);
        const medY = sorted[Math.floor(sorted.length / 2)];
        for (const n of nodes) n.y = medY;
      } else if (spanY > spanX * 1.5 && spanX < ALIGN_THRESHOLD * chain.length) {
        // Vertical chain → align X to median
        const sorted = [...xs].sort((a, b) => a - b);
        const medX = sorted[Math.floor(sorted.length / 2)];
        for (const n of nodes) n.x = medX;
      }
    }

    // ── Step 3: Snap near-aligned pairs (branch nodes → 90° snap) ──
    const SNAP = 25;
    for (const e of g.edges) {
      const a = nMap[e.from], b = nMap[e.to];
      if (!a || !b) continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      // If almost horizontal, snap Y
      if (dy > 0 && dy < SNAP && dx > dy * 2) {
        // Snap the one with fewer connections to the other's Y
        if (adj[a.id].length <= adj[b.id].length) a.y = b.y;
        else b.y = a.y;
      }
      // If almost vertical, snap X
      if (dx > 0 && dx < SNAP && dy > dx * 2) {
        if (adj[a.id].length <= adj[b.id].length) a.x = b.x;
        else b.x = a.x;
      }
    }
  }

  // ── Helpers ──
  function getNode(id) { return graph?.nodes.find(n => n.id === id); }

  function getNeighbors(id) {
    if (!graph) return [];
    const neighbors = new Set();
    for (const e of graph.edges) {
      if (e.from === id) neighbors.add(e.to);
      if (e.to === id) neighbors.add(e.from);
    }
    return [...neighbors];
  }

  function nextId() {
    const maxId = graph.nodes.reduce((max, n) => Math.max(max, parseInt(n.id) || 0), 0);
    return String(maxId + 1);
  }

  // ── Save ──
  async function saveGraph() {
    if (!graph) return;
    try {
      await saveRoutes(graph);
    } catch (e) { console.error('Save failed:', e); }
  }

  // ── Pan ──
  function onSvgMouseDown(e) {
    if (e.target.closest('.node-group') || e.target.closest('.edge-hit')) return;
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y });
    }
  }

  function onSvgMouseMove(e) {
    if (isPanning && panStart) {
      const rect = svgRef.current.getBoundingClientRect();
      const dx = (e.clientX - panStart.x) / rect.width * viewBox.w;
      const dy = (e.clientY - panStart.y) / rect.height * viewBox.h;
      setViewBox(prev => ({ ...prev, x: panStart.vx - dx, y: panStart.vy - dy }));
    }
    // Drag node
    if (dragId && editMode) {
      const rect = svgRef.current.getBoundingClientRect();
      let sx = viewBox.x + (e.clientX - rect.left) / rect.width * viewBox.w;
      let sy = viewBox.y + (e.clientY - rect.top) / rect.height * viewBox.h;

      // Magnet snap: align to neighbor's x or y within threshold
      const SNAP = 15;
      const neighbors = getNeighbors(dragId);
      for (const nId of neighbors) {
        const nb = getNode(nId);
        if (!nb) continue;
        if (Math.abs(sx - nb.x) < SNAP) sx = nb.x;
        if (Math.abs(sy - nb.y) < SNAP) sy = nb.y;
      }

      setGraph(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => n.id === dragId ? { ...n, x: Math.round(sx), y: Math.round(sy) } : n),
      }));
    }
  }

  function onSvgMouseUp() {
    setIsPanning(false);
    setPanStart(null);
    if (dragId) { setDragId(null); saveGraph(); }
  }

  function onSvgClick() {
    setPopup(null);
    if (editMode) { setSelNode(null); setSelEdge(null); setLinkFrom(null); }
  }

  // ── Node click ──
  async function onNodeClick(id, e) {
    e.stopPropagation();

    if (editMode) {
      // Linking mode: second click creates edge
      if (linkFrom && linkFrom !== id) {
        const exists = graph.edges.some(e =>
          (e.from === linkFrom && e.to === id) || (e.from === id && e.to === linkFrom)
        );
        if (!exists) {
          setGraph(prev => ({ ...prev, edges: [...prev.edges, { from: linkFrom, to: id }] }));
        }
        setLinkFrom(null);
        setSelNode(id);
        return;
      }
      setSelNode(id);
      setSelEdge(null);
      setLinkFrom(null);
      return;
    }

    // View mode: popup
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const node = getNode(id);
    const dbId = node?.db_id;
    try {
      if (!dbId) throw new Error('no db_id');
      const info = await getIntersection(dbId);
      setPopup({ id, x: px, y: py, info, dbId });
    } catch {
      setPopup({ id, x: px, y: py, info: { id: dbId || id, name: node?.name || '?', manufacturer: '-', status: '미확인' }, dbId });
    }
  }

  // ── Edge click ──
  function onEdgeClick(idx, e) {
    e.stopPropagation();
    if (!editMode) return;
    setSelEdge(idx);
    setSelNode(null);
    setLinkFrom(null);
  }

  // ── Edit: Add node (connected to selected) ──
  function addNode() {
    const name = prompt('교차로명 입력:');
    if (!name) return;
    const id = nextId();

    const anchor = selNode ? getNode(selNode) : null;
    const newNode = {
      id, name,
      x: anchor ? anchor.x + 120 : 800,
      y: anchor ? anchor.y : 500,
    };
    const newEdges = selNode ? [{ from: selNode, to: id }] : [];

    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: [...prev.edges, ...newEdges],
    }));
    setSelNode(id);
  }

  // ── Edit: Delete node ──
  function deleteNode() {
    if (!selNode) return;
    if (!confirm(`"${getNode(selNode)?.name}" 노드를 삭제하시겠습니까?`)) return;

    const neighbors = getNeighbors(selNode);

    setGraph(prev => {
      const newEdges = prev.edges.filter(e => e.from !== selNode && e.to !== selNode);
      // Auto-reconnect if exactly 2 neighbors
      if (neighbors.length === 2) {
        const [a, b] = neighbors;
        const exists = newEdges.some(e =>
          (e.from === a && e.to === b) || (e.from === b && e.to === a)
        );
        if (!exists) newEdges.push({ from: a, to: b });
      }
      return {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== selNode),
        edges: newEdges,
      };
    });
    setSelNode(null);
  }

  // ── Edit: Insert node on edge ──
  function insertOnEdge() {
    if (selEdge === null) return;
    const edge = graph.edges[selEdge];
    if (!edge) return;

    const name = prompt('삽입할 교차로명:');
    if (!name) return;
    const id = nextId();

    const nA = getNode(edge.from);
    const nB = getNode(edge.to);
    const newNode = {
      id, name,
      x: Math.round(((nA?.x || 0) + (nB?.x || 0)) / 2),
      y: Math.round(((nA?.y || 0) + (nB?.y || 0)) / 2),
    };

    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: [
        ...prev.edges.filter((_, i) => i !== selEdge),
        { from: edge.from, to: id },
        { from: id, to: edge.to },
      ],
    }));
    setSelEdge(null);
    setSelNode(id);
  }

  // ── Edit: Delete edge ──
  function deleteEdge() {
    if (selEdge === null) return;
    setGraph(prev => ({ ...prev, edges: prev.edges.filter((_, i) => i !== selEdge) }));
    setSelEdge(null);
  }

  // ── Edit: Insert between two nodes (from sidebar neighbor list) ──
  function insertBetween(aId, bId) {
    const name = prompt('삽입할 교차로명:');
    if (!name) return;
    const id = nextId();

    const nA = getNode(aId);
    const nB = getNode(bId);
    const newNode = {
      id, name,
      x: Math.round(((nA?.x || 0) + (nB?.x || 0)) / 2),
      y: Math.round(((nA?.y || 0) + (nB?.y || 0)) / 2),
    };

    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      edges: [
        ...prev.edges.filter(e =>
          !((e.from === aId && e.to === bId) || (e.from === bId && e.to === aId))
        ),
        { from: aId, to: id },
        { from: id, to: bId },
      ],
    }));
    setSelNode(id);
  }

  // ── Edit: Start linking ──
  function startLink() {
    if (!selNode) return;
    setLinkFrom(selNode);
  }

  // ── Fit view ──
  function fitView() { setViewBox({ x: -50, y: -50, w: 2600, h: 1800 }); }

  // ── Search ──
  function focusNode(id) {
    const node = getNode(id);
    if (!node) return;
    setViewBox({ x: node.x - 500, y: node.y - 350, w: 1000, h: 700 });
    setHighlightId(id);
    setSearchQuery('');
    setSearchOpen(false);
    setTimeout(() => setHighlightId(null), 3000);
  }

  // ── DAT upload handler ──
  async function handleDatUpload(file) {
    if (!popup || !file) return;
    const node = getNode(popup.id);
    if (!node) return;

    setUploading(true);
    setUploadMsg(null);
    try {
      const result = await registerDat(file, node.name, popup.dbId || null);

      // Update node's db_id in graph
      const updatedGraph = {
        ...graph,
        nodes: graph.nodes.map(n => n.id === popup.id ? { ...n, db_id: result.id } : n),
      };
      setGraph(updatedGraph);

      // Save updated graph immediately (with new db_id)
      try { await saveRoutes(updatedGraph); } catch (e) { console.error('Save failed:', e); }

      // Update popup with new info
      try {
        const info = await getIntersection(result.id);
        setPopup(prev => prev ? { ...prev, info, dbId: result.id } : null);
      } catch { /* ignore, popup still works */ }

      // Show result message
      const msgs = [`${result.name} 등록 완료 (${result.id})`];
      msgs.push(`제조사: ${result.manufacturer} / 현시: ${result.phases}개 / 계획: ${result.plans}개`);
      if (result.cycleMessage) msgs.push(result.cycleMessage);

      setUploadMsg({
        type: result.isHanjin ? 'warning' : 'success',
        text: msgs.join('\n'),
      });
    } catch (e) {
      setUploadMsg({ type: 'error', text: `등록 실패: ${e.message}` });
    } finally {
      setUploading(false);
    }
  }

  function getSearchResults() {
    if (!graph || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return graph.nodes
      .filter(n => n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 8);
  }

  // ── Bezier curve path between two nodes ──
  function edgePath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Nearly aligned → straight line
    if (absDx < 12 || absDy < 12 || absDx > absDy * 3 || absDy > absDx * 3) {
      return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    }

    // Diagonal → smooth S-curve
    const cx1 = a.x + dx * 0.4;
    const cy1 = a.y;
    const cx2 = b.x - dx * 0.4;
    const cy2 = b.y;
    return `M ${a.x} ${a.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.x} ${b.y}`;
  }

  // ── Render ──
  if (error) return <div className="loading">오류: {error}</div>;
  if (!graph) return <div className="loading">로딩 중...</div>;

  const { nodes, edges } = graph;
  const selectedNode = selNode ? getNode(selNode) : null;
  const selectedEdge = selEdge !== null ? edges[selEdge] : null;

  return (
    <div className="yodo-layout">
      {/* ── Main ── */}
      <div className="yodo-main">
        {/* Toolbar */}
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <div className="yodo-search" ref={searchRef}>
            <input
              className="search-input"
              style={{ width: 200, minWidth: 140 }}
              placeholder="교차로 검색..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
            />
            {searchOpen && searchQuery.trim() && (() => {
              const results = getSearchResults();
              return (
                <div className="yodo-search-dropdown">
                  {results.length === 0
                    ? <div className="yodo-search-empty">결과 없음</div>
                    : results.map(r => (
                        <div key={r.id} className="yodo-search-item" onClick={() => focusNode(r.id)}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: LINE_COLOR, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="yodo-search-name">{r.name}</div>
                            <div className="yodo-search-sub">{r.id}</div>
                          </div>
                        </div>
                      ))
                  }
                </div>
              );
            })()}
          </div>

          <button className="btn" onClick={fitView}>전체 보기</button>
          <button
            className={`btn ${editMode ? 'btn-primary' : ''}`}
            onClick={() => {
              setEditMode(!editMode);
              setSelNode(null); setSelEdge(null); setPopup(null); setLinkFrom(null);
            }}
          >
            {editMode ? '편집 완료' : '편집 모드'}
          </button>
          {editMode && (
            <button className="btn btn-primary" onClick={saveGraph}>저장</button>
          )}
          <span className="count-label">{nodes.length}개 노드 / {edges.length}개 연결</span>
        </div>

        {/* SVG */}
        <div ref={containerRef} className="card yodo-svg-wrap" style={{ cursor: isPanning ? 'grabbing' : 'grab' }}>
          <svg
            ref={svgRef}
            width="100%" height="100%"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            onMouseDown={onSvgMouseDown}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
            onClick={onSvgClick}
            style={{ background: '#0d1321', display: 'block' }}
          >
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect x={viewBox.x - 500} y={viewBox.y - 500} width={viewBox.w + 1000} height={viewBox.h + 1000} fill="url(#grid)" />

            {/* Edges */}
            {edges.map((edge, i) => {
              const a = getNode(edge.from);
              const b = getNode(edge.to);
              if (!a || !b) return null;
              const isSel = selEdge === i;
              const isHov = hoveredEdge === i;
              const color = isSel ? '#fbbf24' : isHov ? LINE_COLOR_HOVER : LINE_COLOR;

              const d = edgePath(a, b);
              return (
                <g key={`e-${i}`}>
                  <path d={d}
                    fill="none" stroke={color} strokeWidth={isSel ? 4 : LINE_WIDTH}
                    strokeLinecap="round" opacity={isSel ? 1 : 0.6}
                  />
                  {/* Invisible wider hit area for clicking */}
                  {editMode && (
                    <path d={d}
                      className="edge-hit"
                      fill="none" stroke="transparent" strokeWidth={EDGE_HIT_WIDTH}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => onEdgeClick(i, e)}
                      onMouseEnter={() => setHoveredEdge(i)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    />
                  )}
                </g>
              );
            })}

            {/* Linking preview line */}
            {linkFrom && (() => {
              const from = getNode(linkFrom);
              return from ? (
                <line x1={from.x} y1={from.y} x2={from.x + 60} y2={from.y}
                  stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4" opacity={0.6}
                />
              ) : null;
            })()}

            {/* Nodes */}
            {nodes.map(node => {
              const isSel = selNode === node.id;
              const isHov = hoveredNode === node.id;
              const isHL = highlightId === node.id;
              const isLinkSrc = linkFrom === node.id;
              const r = isSel || isHov || isHL ? NODE_R + 3 : NODE_R;

              return (
                <g
                  key={node.id}
                  className="node-group"
                  style={{ cursor: editMode ? (linkFrom ? 'crosshair' : 'move') : 'pointer' }}
                  onClick={(e) => onNodeClick(node.id, e)}
                  onMouseDown={editMode && !linkFrom ? (e) => { e.stopPropagation(); setDragId(node.id); } : undefined}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Highlight pulse */}
                  {isHL && (
                    <>
                      <circle cx={node.x} cy={node.y} r={r + 12} fill="none" stroke={LINE_COLOR} strokeWidth={2} opacity={0.3}>
                        <animate attributeName="r" from={r + 6} to={r + 20} dur="1s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="1s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={node.x} cy={node.y} r={r + 6} fill="none" stroke={LINE_COLOR} strokeWidth={2} opacity={0.5} />
                    </>
                  )}
                  {/* Selection ring */}
                  {(isSel || isLinkSrc) && (
                    <circle cx={node.x} cy={node.y} r={r + 5} fill="none"
                      stroke={isLinkSrc ? '#fbbf24' : LINE_COLOR} strokeWidth={2} opacity={0.7}
                      strokeDasharray={isLinkSrc ? '4 3' : 'none'}
                    />
                  )}
                  <circle cx={node.x} cy={node.y} r={r + 2} fill="#0d1321" />
                  <circle cx={node.x} cy={node.y} r={r} fill={LINE_COLOR}
                    stroke={isSel ? LINE_COLOR_HOVER : '#0d1321'} strokeWidth={2}
                  />
                  <text
                    x={node.x} y={node.y + LABEL_Y + r}
                    textAnchor="middle" fontSize="10" fill="#94a3b8"
                    fontWeight={isHov || isSel ? '600' : '400'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Popup (view mode) */}
          {popup && (
            <div className="yodo-popup"
              style={{
                left: Math.min(popup.x + 10, (containerRef.current?.clientWidth || 600) - 280),
                top: Math.min(popup.y - 10, (containerRef.current?.clientHeight || 400) - 260),
                minWidth: 240,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{popup.info.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{popup.info.id}</div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>제조사: {popup.info.manufacturer || '-'}</div>
              {popup.info.dat?.filename && (
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  현시: {popup.info.dat.phases || '-'}개 / 주기: {popup.info.dat.plans?.[0]?.cycle || '-'}초
                </div>
              )}
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                DAT: {popup.info.dat?.filename ? <span className="check">O</span> : <span className="cross">X</span>}
                {' '}주기표: {popup.info.cycle_table?.filename ? <span className="check">O</span> : <span className="cross">X</span>}
              </div>

              {/* DAT 업로드 */}
              <div style={{ marginBottom: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".dat"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files[0]) handleDatUpload(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  className={`btn ${popup.info.dat?.filename ? '' : 'btn-primary'}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? 'DAT 업로드 중...' : popup.info.dat?.filename ? 'DAT 재업로드' : 'DAT 파일 업로드'}
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {popup.info.dat?.filename
                    ? '새 DAT 파일로 교체하면 주기표도 재생성됩니다'
                    : 'DAT 업로드 시 자동으로 DB 등록 및 주기표가 생성됩니다'}
                </div>
              </div>

              {/* Upload result message */}
              {uploadMsg && (
                <div style={{
                  fontSize: 12, padding: '6px 8px', borderRadius: 6, marginBottom: 8,
                  lineHeight: 1.5, whiteSpace: 'pre-line',
                  background: uploadMsg.type === 'success' ? 'rgba(34,197,94,0.15)' :
                              uploadMsg.type === 'warning' ? 'rgba(234,179,8,0.15)' :
                              'rgba(239,68,68,0.15)',
                  color: uploadMsg.type === 'success' ? '#22c55e' :
                         uploadMsg.type === 'warning' ? '#eab308' : '#ef4444',
                  border: `1px solid ${uploadMsg.type === 'success' ? 'rgba(34,197,94,0.3)' :
                           uploadMsg.type === 'warning' ? 'rgba(234,179,8,0.3)' :
                           'rgba(239,68,68,0.3)'}`,
                }}>
                  {uploadMsg.text}
                </div>
              )}

              <div className="btn-group" style={{ marginTop: 8 }}>
                {popup.dbId && (
                  <button className="btn btn-primary" onClick={() => navigate(`/intersection/${popup.dbId}`)}>상세 보기</button>
                )}
                <button className="btn" onClick={() => { setPopup(null); setUploadMsg(null); }}>닫기</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="yodo-sidebar">
        {editMode ? (
          <div className="card yodo-sidebar-card">
            <div className="section-title">편집</div>

            {/* Node actions */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>노드</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="btn" onClick={addNode} style={{ width: '100%', justifyContent: 'center' }}>
                  {selNode ? `+ "${selectedNode?.name}" 에서 추가` : '+ 새 노드 추가'}
                </button>
                {selNode && (
                  <>
                    <button className="btn" onClick={startLink} style={{ width: '100%', justifyContent: 'center' }}>
                      {linkFrom ? '연결할 노드를 클릭...' : '연결선 추가'}
                    </button>
                    <button className="btn" onClick={deleteNode}
                      style={{ width: '100%', justifyContent: 'center', color: 'var(--red)' }}>
                      노드 삭제
                    </button>
                  </>
                )}
                {linkFrom && (
                  <button className="btn" onClick={() => setLinkFrom(null)}
                    style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
                    연결 취소
                  </button>
                )}
              </div>
            </div>

            {/* Edge actions */}
            {selEdge !== null && selectedEdge && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  선: {getNode(selectedEdge.from)?.name} — {getNode(selectedEdge.to)?.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button className="btn" onClick={insertOnEdge} style={{ width: '100%', justifyContent: 'center' }}>
                    중간에 노드 삽입
                  </button>
                  <button className="btn" onClick={deleteEdge}
                    style={{ width: '100%', justifyContent: 'center', color: 'var(--red)' }}>
                    연결 해제
                  </button>
                </div>
              </div>
            )}

            {/* Selected node info + neighbor list */}
            {selectedNode && (() => {
              const neighbors = getNeighbors(selNode);
              return (
                <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>선택된 노드</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedNode.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selectedNode.id}</div>

                  {neighbors.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        연결된 노드 ({neighbors.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {neighbors.map(nId => {
                          const nb = getNode(nId);
                          return (
                            <div key={nId} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '4px 6px', borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                            }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: LINE_COLOR, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {nb?.name || nId}
                              </div>
                              <button
                                className="btn"
                                style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
                                onClick={() => insertBetween(selNode, nId)}
                                title={`${selectedNode.name}과 ${nb?.name} 사이에 삽입`}
                              >
                                사이 삽입
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Help text */}
            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              노드 드래그: 위치 이동<br />
              노드 클릭: 선택<br />
              선 클릭: 선택 (삽입/삭제)<br />
              "연결선 추가" → 대상 클릭
            </div>
          </div>
        ) : (
          <div className="card yodo-sidebar-card">
            <div className="section-title">요도 정보</div>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>노드</span>
                <span>{nodes.length}개</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>연결</span>
                <span>{edges.length}개</span>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              마우스 휠: 줌<br />
              드래그: 팬<br />
              노드 클릭: 상세정보
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
