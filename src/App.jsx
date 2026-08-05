import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import ToolPage from './pages/ToolPage.jsx';
import NotFound from './pages/NotFound.jsx';

// Top-level routing. Layout wraps every page (header/nav/footer), and the
// three routes below are the whole site: the homepage, a single dynamic
// route that renders any tool by id, and a catch-all for bad URLs.

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/tool/:id" element={<ToolPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
