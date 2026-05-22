import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    heading: "",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/upload", label: "Upload" },
    ],
  },
  {
    heading: "Documents",
    items: [
      { to: "/contracts", label: "Contracts" },
      { to: "/review", label: "Review" },
      { to: "/email", label: "Email" },
    ],
  },
  {
    heading: "Supplier",
    items: [
      { to: "/hotels", label: "Hotels" },
      { to: "/restaurants", label: "Restaurants" },
      { to: "/transportation", label: "Transportation" },
    ],
  },
  {
    heading: "Prices",
    items: [
      { to: "/prices", label: "Hotels" },
      { to: "/restaurants", label: "Restaurants" },
      { to: "/transportation", label: "Transportation" },
    ],
  },
  {
    heading: "",
    items: [
      { to: "/settings", label: "Settings" },
    ],
  },
];

const CRM_URL = "https://crm.vmmorocco.com";

const SIDEBAR_WIDTH = 220;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const w = collapsed ? 60 : SIDEBAR_WIDTH;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f5f5f5" }}>
      {/* Left navigation sidebar */}
      <aside
        style={{
          width: w,
          minWidth: w,
          background: "#fff",
          borderRight: "1px solid #e8e8e8",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "width 0.2s ease",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: collapsed ? "16px 8px" : "20px 18px",
            borderBottom: "1px solid #e8e8e8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {!collapsed && (
            <span style={{ color: "#696cff", fontSize: "1.1rem", fontWeight: 700 }}>
              Corevia
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#999",
              fontSize: "1rem",
              padding: "2px 4px",
              lineHeight: 1,
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "▸" : "◂"}
          </button>
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              {group.heading && !collapsed && (
                <div
                  style={{
                    padding: "10px 18px 4px",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "#aaa",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {group.heading}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    padding: collapsed ? "8px 0" : "7px 18px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    color: isActive ? "#696cff" : "#555",
                    textDecoration: "none",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: "0.88rem",
                    background: isActive ? "rgba(105,108,255,0.08)" : "transparent",
                    borderRight: isActive ? "3px solid #696cff" : "3px solid transparent",
                  })}
                  title={collapsed ? item.label : undefined}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
                </NavLink>
              ))}
              {gi < NAV.length - 1 && (
                <div style={{ height: 1, background: "#f0f0f0", margin: "6px 14px" }} />
              )}
            </div>
          ))}
          <div style={{ height: 1, background: "#f0f0f0", margin: "6px 14px" }} />
          <a
            href={CRM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              padding: collapsed ? "8px 0" : "7px 18px",
              justifyContent: collapsed ? "center" : "flex-start",
              color: "#059669",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: "0.88rem",
              gap: 6,
            }}
            title={collapsed ? "Open CRM" : undefined}
          >
            {collapsed ? "C" : <>CRM <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>&#8599;</span></>}
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, padding: "1.5rem", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
