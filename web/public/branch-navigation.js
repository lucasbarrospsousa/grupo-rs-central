// Navigation visibility only; server permissions and stored data are unchanged.
export function branchRouteVisible(branch,route){return branch==='imperatriz'||!['warehouse','link'].includes(route);}
