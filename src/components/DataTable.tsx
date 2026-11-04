import Link from "next/link";
import { Fragment, ReactNode } from "react";

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  align?: "right";
  nowrap?: boolean;
  /** Secondary detail: shown on desktop, dropped on tablet so nothing scrolls sideways. */
  desktopOnly?: boolean;
}

/**
 * One data set, two presentations: an iOS list on phones, and an aligned table with
 * hover states on tablet and desktop. CSS shows exactly one, so screen readers get one.
 */
export function DataTable<T>(props: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  /** The phone list row. */
  mobile: (row: T) => ReactNode;
  href?: (row: T) => string;
  empty?: string;
}) {
  if (props.rows.length === 0) return <p className="empty">{props.empty ?? "Nothing here."}</p>;
  return (
    <>
      <ul className="list only-phone">
        {props.rows.map((row) => {
          const key = props.rowKey(row);
          return props.href ? (
            <li key={key}>
              <Link className="nav-row" href={props.href(row)}>
                <span className="grow">{props.mobile(row)}</span>
              </Link>
            </li>
          ) : (
            <li key={key}>{props.mobile(row)}</li>
          );
        })}
      </ul>
      <div className="data-table-wrap only-wide">
        <table className="data-table">
          <thead>
            <tr>
              {props.columns.map((c) => (
                <th key={c.label} className={[c.align === "right" ? "num" : "", c.desktopOnly ? "desktop-only" : ""].join(" ").trim() || undefined}>{c.label}</th>
              ))}
              {props.href && <th aria-hidden="true" />}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={props.rowKey(row)}>
                {props.columns.map((c, i) => (
                  <td key={c.label} className={[c.align === "right" ? "num" : "", c.nowrap ? "nowrap" : "", c.desktopOnly ? "desktop-only" : ""].join(" ").trim() || undefined}>
                    {i === 0 && props.href ? (
                      <Link className="row-link" href={props.href(row)}>{c.render(row)}</Link>
                    ) : (
                      <Fragment>{c.render(row)}</Fragment>
                    )}
                  </td>
                ))}
                {props.href && <td className="cell-chevron" aria-hidden="true" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return <span className={`avatar ${large ? "lg" : ""}`} aria-hidden="true">{initials}</span>;
}

export function PersonCell({ name }: { name: string }) {
  return (
    <span className="name-cell">
      <Avatar name={name} />
      <span>{name}</span>
    </span>
  );
}
