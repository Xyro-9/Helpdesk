// Gemeinsame UI-Bausteine (Tailwind). Alle Module sollen diese verwenden,
// damit die Oberfläche einheitlich aussieht.

import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ─────────────── Buttons ───────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 whitespace-nowrap'
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-700',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
}

export function Button({ variant = 'secondary', size = 'md', className, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button type="button" className={cx(btnBase, btnVariants[variant], size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm', className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ title, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button type="button" title={title} aria-label={title} className={cx('inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  )
}

// ─────────────── Formulare ───────────────

const fieldBase = 'w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-100 disabled:text-slate-500'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, 'h-9', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, 'py-2 leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'h-9 pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700', disabled && 'opacity-50')}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-sky-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

// ─────────────── Anzeige ───────────────

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'sky'
const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>
}

export function Card({ children, className, title, actions, bodyClassName }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; bodyClassName?: string }) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <div className="flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex items-center gap-3">
        {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">{icon}</div>}
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-slate-500">
      {icon && <div className="text-slate-300">{icon}</div>}
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm', value === t.id ? 'border-sky-600 font-medium text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, size = 'md' }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-2xl', w)} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <IconButton title="Schließen" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{children}</kbd>
}

export function Stat({ label, value, sub, tone = 'gray', icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  const accent: Record<Tone, string> = { gray: 'text-slate-600 bg-slate-100', blue: 'text-blue-600 bg-blue-50', sky: 'text-sky-600 bg-sky-50', green: 'text-emerald-600 bg-emerald-50', amber: 'text-amber-600 bg-amber-50', red: 'text-rose-600 bg-rose-50', violet: 'text-violet-600 bg-violet-50' }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {icon && <div className={cx('flex h-10 w-10 items-center justify-center rounded-lg', accent[tone])}>{icon}</div>}
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-xl font-semibold text-slate-900">{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

/** Einfache Tabelle: <table className={tableCls}> … */
export const tableCls = 'w-full text-left text-sm [&_th]:sticky [&_th]:top-0 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-slate-500 [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100'

/** Sehr einfacher Markdown-Renderer für KB-Artikel & Hinweise (#, ##, -, 1., **fett**, `code`, > Hinweis, ```Block```) */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let code: string[] | null = null
  const flush = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
      out.push(list.ordered ? <ol key={out.length} className="my-2 list-decimal space-y-1 pl-6">{items}</ol> : <ul key={out.length} className="my-2 list-disc space-y-1 pl-6">{items}</ul>)
      list = null
    }
  }
  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('```')) {
      if (code) {
        out.push(<pre key={out.length} className="my-2 overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">{code.join('\n')}</pre>)
        code = null
      } else {
        flush()
        code = []
      }
      return
    }
    if (code) {
      code.push(raw)
      return
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    if (ol || ul) {
      const ordered = !!ol
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((ol ?? ul)![1])
      return
    }
    flush()
    if (!line.trim()) return
    if (line.startsWith('### ')) out.push(<h4 key={out.length} className="mt-3 mb-1 font-semibold text-slate-800">{inline(line.slice(4))}</h4>)
    else if (line.startsWith('## ')) out.push(<h3 key={out.length} className="mt-4 mb-1.5 text-base font-semibold text-slate-900">{inline(line.slice(3))}</h3>)
    else if (line.startsWith('# ')) out.push(<h2 key={out.length} className="mt-2 mb-2 text-lg font-bold text-slate-900">{inline(line.slice(2))}</h2>)
    else if (line.startsWith('> ')) out.push(<div key={out.length} className="my-2 rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">{inline(line.slice(2))}</div>)
    else out.push(<p key={out.length} className="my-1.5">{inline(line)}</p>)
  })
  flush()
  return <div className={cx('text-sm leading-relaxed text-slate-700', className)}>{out}</div>
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-rose-700">{p.slice(1, -1)}</code>
    return p
  })
}
