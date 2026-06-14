import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import MapPage from './pages/MapPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* 중요: :buildingId 라는 이름으로 파라미터를 설정함 */}
        <Route path="/map/:buildingId" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
