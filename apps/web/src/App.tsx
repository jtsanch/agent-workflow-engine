import { Link, Route, Routes } from "react-router-dom";
import { JobsPage } from "./pages/JobsPage.js";
import { RunsPage } from "./pages/RunsPage.js";
import { CreateJobPage } from "./pages/CreateJobPage.js";

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Personal Agent OS</p>
          <h1>Control Plane</h1>
        </div>
        <nav className="nav">
          <Link to="/">Jobs</Link>
          <Link to="/runs">Runs</Link>
          <Link to="/jobs/new">Create Job</Link>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<JobsPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/jobs/new" element={<CreateJobPage />} />
        </Routes>
      </main>
    </div>
  );
}

