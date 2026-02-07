const navItems = ['Home', 'Tracker', 'Breakdown'];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">PFT</div>
        <span>Prop Firm Tracker</span>
      </div>
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item}
            type="button"
            className={item === activePage ? 'sidebar__button is-active' : 'sidebar__button'}
            onClick={() => onNavigate(item)}
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  );
}
