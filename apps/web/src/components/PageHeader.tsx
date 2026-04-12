interface PageHeaderProps {
  title: string;
  description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <p className="eyebrow">MVP</p>
        <h2>{title}</h2>
        <p className="page-header-description">{description}</p>
      </div>
    </header>
  );
}
