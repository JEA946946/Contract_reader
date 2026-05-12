import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <nav
        style={{
          background: "#1a1a2e",
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          gap: "2rem",
          height: "60px",
        }}
      >
        <h1 style={{ color: "#e94560", margin: 0, fontSize: "1.3rem" }}>
          Corevia | Travel Software
        </h1>
        {[
          { to: "/", label: "Dashboard" },
          { to: "/upload", label: "Upload" },
          { to: "/contracts", label: "Contracts" },
          { to: "/review", label: "Review" },
          { to: "/prices", label: "Prices" },
          { to: "/restaurants", label: "Restaurants" },
          { to: "/transportation", label: "Transportation" },
          { to: "/hotels", label: "Hotels" },
          { to: "/add-hotel", label: "Add Hotel" },
          { to: "/settings", label: "Settings" },
        ].map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              color: isActive ? "#e94560" : "#ccc",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 400,
              fontSize: "0.95rem",
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
