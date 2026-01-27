export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              AI Trader Platform
            </h1>
            <p className="text-lg text-muted-foreground">
              Automated trading strategies, backtesting, and portfolio management
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Strategy Management</h3>
              <p className="text-muted-foreground mb-4">
                Create and manage DCA, Grid, and Rule-based trading strategies
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                Coming soon...
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Backtesting</h3>
              <p className="text-muted-foreground mb-4">
                Test strategies on historical data with detailed metrics
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                Coming soon...
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-3">Portfolio</h3>
              <p className="text-muted-foreground mb-4">
                Monitor positions, PnL, and trading performance
              </p>
              <div className="bg-muted p-3 rounded text-sm">
                Coming soon...
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              MVP Development Phase - Frontend scaffolding complete
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}