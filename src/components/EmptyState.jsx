export function EmptyState({ title, children }) {
  return (
    <div className="py-10 px-4 text-center">
      <p className="m-0 font-medium">{title}</p>
      {children ? <p className="mt-1 mb-0 text-graphite text-[0.8125rem] max-w-[42ch] mx-auto">{children}</p> : null}
    </div>
  );
}
