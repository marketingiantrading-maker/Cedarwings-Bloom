// Cedarwings SAS — Page Access Control
// Include this in every protected page

const CW_ACCESS = {
  EK: "cw_current_emp",
  RK: "cw_role", 
  PK: "cw_pages",
  CRK: "cw_custom_role",

  // Which pages each access key unlocks
  PAGE_ACCESS: {
    all:        ["manager","production","machines","employees","employee_profile","time_report","inventory","clocking","tracabilite","qualite","settings"],
    manager:    ["manager","production","machines","employees","employee_profile","time_report","inventory","clocking","tracabilite","qualite","settings"],
    quality_control: ["tracabilite","qualite","manager"],
    inventory_manager: ["inventory","production","tracabilite","manager"],
    production_supervisor: ["production","machines","clocking","time_report","employee_profile","manager"],
    hr_manager: ["employees","employee_profile","time_report","manager"],
    employee:   ["clocking","employee_profile"]
  },

  getPages() {
    try { return JSON.parse(sessionStorage.getItem(this.PK)||'["clocking","employee_profile"]') }
    catch { return ["clocking","employee_profile"] }
  },

  getRole() { return sessionStorage.getItem(this.RK)||"employee" },
  getCustomRole() { return sessionStorage.getItem(this.CRK)||this.getRole() },
  getName() { return sessionStorage.getItem(this.EK)||localStorage.getItem(this.EK)||"" },
  isManager() { return this.getRole()==="manager" },
  hasAccess(page) {
    const pages = this.getPages()
    return pages.includes("all") || pages.includes(page) || pages.includes("manager")
  },

  // Call at top of every protected page
  guard(thisPage) {
    const name = this.getName()
    if(!name) { window.location.href="index.html"; return false }
    if(!this.hasAccess(thisPage)) {
      // Redirect to their home page
      const pages = this.getPages()
      const home = pages.includes("all") ? "manager.html" : 
                   pages[0] ? pages[0]+".html" : "clocking.html"
      window.location.href = home
      return false
    }
    return true
  },

  // Build sidebar nav based on access
  buildSidebar(activeKey) {
    const pages = this.getPages()
    const hasAll = pages.includes("all") || pages.includes("manager")
    const has = (k) => hasAll || pages.includes(k)
    const link = (href, ic, label, key) => 
      has(key) ? `<a href="${href}" class="nl${key===activeKey?' on':''}"><span class="ic">${ic}</span>${label}</a>` : ''
    
    return `
      <div class="sb-s">Operations</div>
      ${link('manager.html','📊','Dashboard','manager')}
      ${link('production.html','🏭','Production','production')}
      ${link('machines.html','⚙','Machines','machines')}
      <div class="sb-s" style="${has('employees')||has('employee_profile')||has('time_report')?'':'display:none'">Team</div>
      ${link('employees.html','👥','Employees','employees')}
      ${link('employee_profile.html','👤','Employee Profile','employee_profile')}
      ${link('time_report.html','📈','Time Report','time_report')}
      <div class="sb-s" style="${has('tracabilite')||has('qualite')?'':'display:none'">Quality</div>
      ${link('tracabilite.html','🔖','Traceability','tracabilite')}
      ${link('qualite.html','✅','Quality Control','qualite')}
      <div class="sb-s" style="${has('inventory')?'':'display:none'">Resources</div>
      ${link('inventory.html','📦','Inventory','inventory')}
      <div class="sb-s" style="${has('settings')||has('clocking')?'':'display:none'">System</div>
      ${link('settings.html','⚙','Settings','settings')}
      ${link('clocking.html','⏱','Clocking Terminal','clocking')}
    `
  }
}

// Auto-guard: redirect if not logged in or no access
// Usage at top of each page: <script>const PAGE_KEY='manager'</script> then include access.js
if(typeof PAGE_KEY !== 'undefined') {
  if(!CW_ACCESS.guard(PAGE_KEY)) {
    // guard() handles redirect
  }
}
