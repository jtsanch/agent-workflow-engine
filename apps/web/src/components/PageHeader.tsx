interface PageHeaderProps {
  title: string;
  description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">MVP</p>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </header>
  );
}

