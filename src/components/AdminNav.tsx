"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppearanceSwitch } from "./AppearanceSwitch";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "./icons";

// name, path, icon, and the tile colour used in the More sheet (iOS system colours).
const SCREENS: [string, string, string, string][] = [
  ["Dashboard", "/dashboard", "home", "#007aff"],
  ["Take Attendance", "/attendance", "checklist", "#007aff"],
  ["People", "/people", "people", "#007aff"],
  ["Follow-Ups", "/follow-ups", "bubble", "#007aff"],
  ["Programs", "/programs", "calendar", "#ff3b30"],
  ["Engagement", "/engagement", "chart", "#34c759"],
  ["Altar Call", "/altar-call", "flame", "#ff9500"],
  ["Discipleship Academy", "/academy", "cap", "#5856d6"],
  ["Departments", "/departments", "grid", "#00a5c8"],
  ["Department Attendance", "/department-attendance", "seal", "#00a5c8"],
  ["Waiting Corner", "/waiting-corner", "hourglass", "#a2845e"],
  ["Service Reviews", "/reviews", "doc", "#af52de"],
  ["Reports", "/reports", "bars", "#ff2d55"],
  ["Export", "/export", "share", "#8e8e93"],
  ["Audit Log", "/audit", "clock", "#8e8e93"],
];

const TABS: [string, string, string][] = [
  ["Home", "/dashboard", "home"],
  ["Attendance", "/attendance", "checklist"],
  ["People", "/people", "people"],
  ["Follow-Ups", "/follow-ups", "bubble"],
];

const MORE_GROUPS = [
  ["/programs", "/engagement", "/altar-call", "/academy"],
  ["/departments", "/department-attendance", "/waiting-corner", "/reviews"],
  ["/reports", "/export", "/audit"],
];

const SIDE_GROUPS: [string, string[]][] = [
  ["Overview", ["/dashboard", "/attendance", "/programs"]],
  ["Congregation", ["/people", "/engagement", "/follow-ups", "/altar-call", "/academy"]],
  ["Departments", ["/departments", "/department-attendance", "/waiting-corner", "/reviews"]],
  ["Records", ["/reports", "/export", "/audit"]],
];

export function AdminNav({ churchName, email }: { churchName: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const sheet = useRef<HTMLDialogElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const screen = SCREENS.find(([, href]) => active(href));
  const nested = pathname.split("/").filter(Boolean).length > 1;
  const inTabs = TABS.some(([, href]) => active(href));
  const closeSheet = () => sheet.current?.close();
  const initial = email[0]?.toUpperCase() ?? "A";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className={`navbar ${scrolled ? "scrolled" : ""}`}>
        {nested && screen ? (
          <Link href={screen[1]} className="back-btn glass" aria-label={`Back to ${screen[0]}`}>
            <Icon name="chevronLeft" size={20} stroke={2.4} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen[0]}</span>
          </Link>
        ) : (
          <span />
        )}
        <span className="navbar-title" aria-hidden="true">{nested ? "" : screen?.[0]}</span>
        <span />
      </header>

      <nav className="sidebar glass" aria-label="Main">
        <div className="brand">
          <BrandLogo size="sm" />
          <span className="brand-text">{churchName}</span>
        </div>
        {SIDE_GROUPS.map(([group, hrefs]) => (
          <div className="side-group" key={group}>
            <div className="side-label">{group}</div>
            {hrefs.map((href) => {
              const [label, , icon] = SCREENS.find((s) => s[1] === href)!;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  aria-current={active(href) ? "page" : undefined}
                  className={`side-link ${active(href) ? "active" : ""}`}
                >
                  <Icon name={icon} size={19} />
                  <span className="side-text">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <button className="rail-more" onClick={() => sheet.current?.showModal()} title="Appearance and account" aria-label="Appearance and account">
          <Icon name="more" size={24} />
        </button>
        <div className="side-foot">
          <div className="side-account">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <span className="side-email" title={email}>{email}</span>
            <button className="sheet-close side-signout" onClick={logout} title="Sign Out" aria-label="Sign Out">
              <Icon name="signout" size={16} stroke={2.2} />
            </button>
          </div>
          <AppearanceSwitch />
        </div>
      </nav>

      <nav className="tabbar glass" aria-label="Tabs">
        {TABS.map(([label, href, icon]) => (
          <Link key={href} href={href} className={`tab ${active(href) ? "active" : ""}`} aria-current={active(href) ? "page" : undefined}>
            <Icon name={icon} size={25} stroke={active(href) ? 2.1 : 1.7} />
            {label}
          </Link>
        ))}
        <button className={`tab ${!inTabs ? "active" : ""}`} onClick={() => sheet.current?.showModal()}>
          <Icon name="more" size={25} />
          More
        </button>
      </nav>

      <dialog
        ref={sheet}
        className="ios-sheet nav-sheet"
        aria-label="More"
        onClick={(e) => {
          if (e.target === sheet.current) closeSheet();
        }}
      >
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2>More</h2>
          <button className="sheet-close" onClick={closeSheet} aria-label="Close">
            <Icon name="close" size={16} stroke={2.4} />
          </button>
        </div>
        <div className="nav-groups">
          {MORE_GROUPS.map((group) => (
            <ul className="sheet-group" key={group[0]}>
              {group.map((href) => {
                const [label, , icon, color] = SCREENS.find((s) => s[1] === href)!;
                return (
                  <li key={href}>
                    <Link href={href} onClick={closeSheet}>
                      <span className="icon-tile" style={{ background: color }}><Icon name={icon} size={19} stroke={2} /></span>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
        <AppearanceSwitch />
        <ul className="sheet-group">
          <li>
            <button onClick={logout} style={{ color: "var(--danger)" }}>
              <span className="icon-tile" style={{ background: "var(--danger-fill)" }}><Icon name="signout" size={19} stroke={2} /></span>
              <span>Sign Out <span className="sub">{email}</span></span>
            </button>
          </li>
        </ul>
      </dialog>
    </>
  );
}
