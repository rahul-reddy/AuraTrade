export default function PageHeader({ eyebrow, title, description, children }: {
  eyebrow: string
  title: string
  description: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="page-header mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] text-zinc-100 sm:text-3xl">{title}</h1>
        <div className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{description}</div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
