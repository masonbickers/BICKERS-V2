"use client";

import {
  Children,
  cloneElement,
  createElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
} from "react";
import styles from "./ui.module.css";

const cx = (...values) => values.filter(Boolean).join(" ");
const gapClass = (gap) => styles[`gap${Math.min(6, Math.max(1, Number(gap) || 3))}`];

export function Page({ children, width = "standard", className = "", innerClassName = "", ...props }) {
  return (
    <main className={cx(styles.page, width === "fluid" && styles.pageFluid, width === "readable" && styles.pageReadable, className)} {...props}>
      <div className={cx(styles.pageInner, innerClassName)}>{children}</div>
    </main>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions, className = "", children }) {
  return (
    <header className={cx(styles.pageHeader, className)}>
      <div className={styles.pageHeading}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {title ? <h1 className={styles.title}>{title}</h1> : null}
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, actions, children, className = "", ...props }) {
  return (
    <section className={cx(styles.section, className)} {...props}>
      {title || description || actions ? (
        <div className={styles.sectionHeader}>
          <div>{title ? <h2 className={styles.sectionTitle}>{title}</h2> : null}{description ? <p className={styles.sectionDescription}>{description}</p> : null}</div>
          {actions ? <div className={styles.headerActions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stack({ as = "div", direction = "column", gap = 3, className = "", ...props }) {
  return createElement(as, { ...props, className: cx(styles.stack, direction === "row" && styles.row, gapClass(gap), className) });
}

export function Grid({ as = "div", columns = 1, gap = 3, className = "", style, ...props }) {
  return createElement(as, { ...props, className: cx(styles.grid, className), style: { "--grid-columns-desktop": columns, "--grid-gap": `var(--space-${gap})`, ...style } });
}

export function Toolbar({ children, start, end, className = "", ...props }) {
  return <div className={cx(styles.toolbar, className)} {...props}>{children || <><div className={styles.toolbarGroup}>{start}</div><div className={styles.toolbarGroup}>{end}</div></>}</div>;
}

export function Card({ as = "div", interactive = false, className = "", ...props }) {
  return createElement(as, { ...props, className: cx(styles.card, interactive && styles.cardInteractive, className) });
}

export function Panel({ header, footer, children, className = "", ...props }) {
  return <section className={cx(styles.panel, className)} {...props}>{header ? <div className={styles.panelHeader}>{header}</div> : null}<div className={styles.panelBody}>{children}</div>{footer ? <div className={styles.panelFooter}>{footer}</div> : null}</section>;
}

export function StatCard({ label, value, hint, icon, className = "", ...props }) {
  return <Card className={cx(styles.statCard, className)} {...props}>{icon}{label ? <span className={styles.statLabel}>{label}</span> : null}<strong className={styles.statValue}>{value}</strong>{hint ? <span className={styles.statHint}>{hint}</span> : null}</Card>;
}

export function Divider(props) { return <hr className={styles.divider} {...props} />; }

export const Spinner = forwardRef(function Spinner({ label = "Loading", className = "", ...props }, ref) {
  return <span ref={ref} className={cx(styles.spinner, className)} role="status" aria-label={label} {...props} />;
});

export const Button = forwardRef(function Button({ as = "button", variant = "primary", size = "md", loading = false, disabled = false, className = "", children, leadingIcon, trailingIcon, type, ...props }, ref) {
  const Component = as;
  return (
    <Component ref={ref} type={Component === "button" ? (type || "button") : type} className={cx(styles.button, styles[variant], styles[`button${size[0].toUpperCase()}${size.slice(1)}`], loading && styles.buttonLoading, className)} disabled={Component === "button" ? disabled || loading : undefined} aria-disabled={Component !== "button" ? disabled || loading : undefined} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner className={styles.buttonSpinner} label="Loading" /> : null}
      <span className={cx(loading && styles.buttonContentLoading)}>{leadingIcon}{children}{trailingIcon}</span>
    </Component>
  );
});

export const IconButton = forwardRef(function IconButton({ label, size = "md", variant = "secondary", className = "", children, ...props }, ref) {
  return <Button ref={ref} className={cx(styles.iconButton, className)} size={size} variant={variant} aria-label={label} title={props.title || label} {...props}>{children}</Button>;
});

export function FormField({ label, htmlFor, help, error, required = false, children, className = "" }) {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const child = isValidElement(Children.only(children))
    ? cloneElement(Children.only(children), { id: Children.only(children).props.id || id, "aria-describedby": [Children.only(children).props["aria-describedby"], helpId, errorId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : Children.only(children).props["aria-invalid"] })
    : children;
  return <div className={cx(styles.field, className)}>{label ? <label className={styles.label} htmlFor={id}>{label}{required ? <span className={styles.required}> *</span> : null}</label> : null}{child}{help ? <p id={helpId} className={styles.help}>{help}</p> : null}{error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}</div>;
}

export function FormRow({ columns = 2, className = "", style, ...props }) {
  return <div className={cx(styles.formRow, className)} style={{ "--form-columns": columns, ...style }} {...props} />;
}

export const Input = forwardRef(function Input({ className = "", ...props }, ref) { return <input ref={ref} className={cx(styles.control, className)} {...props} />; });
export const Textarea = forwardRef(function Textarea({ className = "", ...props }, ref) { return <textarea ref={ref} className={cx(styles.control, styles.textarea, className)} {...props} />; });
export const Select = forwardRef(function Select({ className = "", children, ...props }, ref) { return <select ref={ref} className={cx(styles.control, className)} {...props}>{children}</select>; });
export const Checkbox = forwardRef(function Checkbox({ label, className = "", ...props }, ref) { return <label className={styles.checkboxLabel}><input ref={ref} type="checkbox" className={cx(styles.checkbox, className)} {...props} /><span>{label}</span></label>; });

export function Tabs({ items = [], value, onChange, label = "Sections", className = "" }) {
  return <div className={cx(styles.tabs, className)} role="tablist" aria-label={label}>{items.map((item) => { const key = item.value ?? item.key; const active = key === value; return <button key={key} type="button" role="tab" aria-selected={active} className={cx(styles.tab, active && styles.tabActive)} disabled={item.disabled} onClick={() => onChange?.(key)}>{item.label}</button>; })}</div>;
}

export function Badge({ variant = "neutral", className = "", ...props }) { return <span className={cx(styles.badge, variant !== "neutral" && styles[`badge${variant[0].toUpperCase()}${variant.slice(1)}`], className)} {...props} />; }
export function Alert({ variant = "neutral", icon, children, className = "", ...props }) { return <div className={cx(styles.alert, variant !== "neutral" && styles[`alert${variant[0].toUpperCase()}${variant.slice(1)}`], className)} role={variant === "danger" ? "alert" : "status"} {...props}>{icon}{<div>{children}</div>}</div>; }
export function EmptyState({ title, description, action, icon, className = "", ...props }) { return <div className={cx(styles.emptyState, className)} {...props}><div>{icon}{title ? <h3 className={styles.emptyTitle}>{title}</h3> : null}{description ? <p className={styles.emptyDescription}>{description}</p> : null}{action ? <div className={styles.section}>{action}</div> : null}</div></div>; }
export function Skeleton({ width = "100%", height = 16, className = "", style, ...props }) { return <span className={cx(styles.skeleton, className)} style={{ display: "block", width, height, ...style }} aria-hidden="true" {...props} />; }

export function Modal({ open, onClose, title, description, children, footer, size = "md", closeLabel = "Close", className = "" }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocusRef.current?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx(styles.modal, size === "sm" && styles.modalSm, size === "lg" && styles.modalLg, className)}><header className={styles.modalHeader}><div><h2 id={titleId} className={styles.modalTitle}>{title}</h2>{description ? <p className={styles.modalDescription}>{description}</p> : null}</div><IconButton label={closeLabel} variant="ghost" onClick={onClose}>×</IconButton></header>{children ? <div className={styles.modalBody}>{children}</div> : null}{footer ? <footer className={styles.modalFooter}>{footer}</footer> : null}</section></div>;
}

export function TableContainer({ children, className = "", ...props }) { return <div className={cx(styles.tableContainer, className)} {...props}>{children}</div>; }
export function Table({ className = "", ...props }) { return <table className={cx(styles.table, className)} {...props} />; }
export function Pagination({ page, totalPages, onPrevious, onNext, label, className = "" }) { return <nav className={cx(styles.pagination, className)} aria-label="Pagination"><span className={styles.paginationMeta}>{label || `Page ${page} of ${totalPages}`}</span><div className={styles.toolbarGroup}><Button variant="secondary" size="sm" onClick={onPrevious} disabled={page <= 1}>Previous</Button><Button variant="secondary" size="sm" onClick={onNext} disabled={page >= totalPages}>Next</Button></div></nav>; }

export { styles as uiStyles };
