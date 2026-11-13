import { StrictMode, lazy, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import "./index.css"
import Landing from "./pages/Landing"

const Console = lazy(() => import("./pages/Console"))

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="grid h-dvh place-items-center label">Loading console…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/console/*" element={<Console />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
