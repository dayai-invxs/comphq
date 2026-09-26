import { Button, Stack, Tab, TabList, TabPanel, Tabs } from '@mond-design-system/react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { AthletesTab } from '../components/AthletesTab/AthletesTab'
import { VolunteersTab } from '../components/VolunteersTab/VolunteersTab'
import { usePeople } from '../usePeople'

// v1: src/app/[slug]/admin/people/page.tsx — everyone entered in the
// competition, athletes and volunteers alike.
//
// v1 held all 642 lines here. The reads and the labelled banner are usePeople,
// the writes both tabs share are useRoster, and each tab draws what only it
// has. What is left is the frame: the count under the title, the one banner,
// the pair of tabs, and the one button that adds to whichever is open.
//
// Only the chosen tab is mounted, as in v1 — leaving both mounted would keep a
// live selection and an open editor behind the tab nobody is looking at. Which
// is also why `adding` is held here and cleared on every change of tab: the
// button that opens the sheet is above both rosters, and the sheet it opens
// belongs to the one on screen.

type Which = 'athletes' | 'volunteers'

export function PeoplePage() {
  const { slug = '' } = useParams()
  const people = usePeople(slug)
  const [tab, setTab] = useState<Which>('athletes')
  const [adding, setAdding] = useState(false)

  function changeTab(next: string) {
    setTab(next as Which)
    setAdding(false)
  }

  return (
    <PageFrame
      title="People"
      description={`${people.athletes.length} athletes · ${people.volunteers.length} volunteers`}
      wide
      actions={
        <Button onClick={() => setAdding(true)}>
          Add {tab === 'athletes' ? 'athlete' : 'volunteer'}
        </Button>
      }
    >
      <Stack gap="section">
        {people.error && (
          <Notice tone="danger" onDismiss={() => people.setError(null)} dismissLabel="Dismiss error">
            {people.error}
          </Notice>
        )}

        <Tabs value={tab} onChange={changeTab}>
          <TabList label="People">
            <Tab value="athletes">Athletes ({people.athletes.length})</Tab>
            <Tab value="volunteers">Volunteers ({people.volunteers.length})</Tab>
          </TabList>

          <TabPanel value="athletes">
            {tab === 'athletes' && (
              <AthletesTab
                slug={slug}
                athletes={people.athletes}
                divisions={people.divisions}
                loading={people.loading}
                setLoading={people.setLoading}
                run={people.run}
                reload={people.reload}
                setAthletes={people.setAthletes}
                adding={adding}
                onCloseAdd={() => setAdding(false)}
              />
            )}
          </TabPanel>

          <TabPanel value="volunteers">
            {tab === 'volunteers' && (
              <VolunteersTab
                slug={slug}
                volunteers={people.volunteers}
                roles={people.roles}
                loading={people.loading}
                setLoading={people.setLoading}
                run={people.run}
                reload={people.reload}
                setVolunteers={people.setVolunteers}
                adding={adding}
                onCloseAdd={() => setAdding(false)}
              />
            )}
          </TabPanel>
        </Tabs>
      </Stack>
    </PageFrame>
  )
}
