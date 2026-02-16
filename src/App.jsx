import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import IntersectionList from './pages/IntersectionList';
import IntersectionDetail from './pages/IntersectionDetail';
import RouteDiagram from './pages/RouteDiagram';
import ReplacementWorkflow from './pages/ReplacementWorkflow';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1><span>TopIT</span> 보령시 교통신호 DB Manager</h1>
        <nav className="nav">
          <NavLink to="/" end>통계</NavLink>
          <NavLink to="/yodo">요도</NavLink>
          <NavLink to="/list">교차로 목록</NavLink>
          <NavLink to="/replace">교체</NavLink>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/yodo" element={<RouteDiagram />} />
          <Route path="/list" element={<IntersectionList />} />
          <Route path="/intersection/:id" element={<IntersectionDetail />} />
          <Route path="/replace" element={<ReplacementWorkflow />} />
        </Routes>
      </main>
    </div>
  );
}
