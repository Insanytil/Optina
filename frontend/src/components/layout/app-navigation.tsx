import { Link } from '@tanstack/react-router'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavigationGroup } from './navigation'

export function AppNavigation({
  groups,
  onNavigate,
}: {
  groups: readonly NavigationGroup[]
  onNavigate: () => void
}) {
  return (
    <SidebarContent>
      <nav aria-label="Navigation principale">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(({ label, to, icon: Icon, exact = false }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to={to}
                        activeOptions={{ exact }}
                        activeProps={{
                          'aria-current': 'page',
                          'data-active': true,
                        }}
                      />
                    }
                    onClick={onNavigate}
                    className="h-10"
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </nav>
    </SidebarContent>
  )
}
