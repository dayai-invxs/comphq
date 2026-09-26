import { EmptyState, Skeleton, Stack } from '@mond-design-system/react'
import { useState } from 'react'
import { useParams } from 'react-router'
import {
  useAddDivision, useDeleteDivision, useDivisions, useImportDivisions, useReorderDivisions, useSaveDivision,
} from '@/api/divisions'
import { useLogo, useRemoveLogo, useUploadLogo } from '@/api/logo'
import { useSettings, useUpdateSettings, type SettingsPatch } from '@/api/settings'
import {
  useAddVolunteerRole, useDeleteVolunteerRole, useImportVolunteerRoles, useSaveVolunteerRole,
  useVolunteerRoles,
} from '@/api/volunteerRoles'
import {
  useAddWorkoutLocation, useDeleteWorkoutLocation, useSaveWorkoutLocation, useWorkoutLocations,
} from '@/api/workoutLocations'
import { Notice } from '@/components/Notice/Notice'
import { PageFrame } from '@/components/PageFrame/PageFrame'
import { CompetitionSettingsSection } from '../components/CompetitionSettingsSection/CompetitionSettingsSection'
import { DivisionsSection } from '../components/DivisionsSection/DivisionsSection'
import { LogoSection } from '../components/LogoSection/LogoSection'
import { NamedListSection } from '../components/NamedListSection/NamedListSection'
import { SectionNav, type SectionLink } from '../components/SectionNav/SectionNav'
import { TvLeaderboardSection } from '../components/TvLeaderboardSection/TvLeaderboardSection'
import styles from './SetupPage.module.css'

// v1: src/app/[slug]/admin/setup/page.tsx — 642 lines holding six sections,
// five reads and fourteen writes. The sections live in ../components; what is
// left here is which write goes where, v1's one error banner, and the list that
// reaches a section without scrolling past the five before it.
//
// The sections are in v1's order, which is not the order of the page heading:
// settings, logo, TV, divisions, locations, roles.

const LINKS: SectionLink[] = [
  { id: 'setup-settings', label: 'Settings' },
  { id: 'setup-logo', label: 'Logo' },
  { id: 'setup-tv', label: 'TV leaderboard' },
  { id: 'setup-divisions', label: 'Divisions' },
  { id: 'setup-locations', label: 'Locations' },
  { id: 'setup-roles', label: 'Volunteer roles' },
]

export function SetupPage() {
  const { slug = '' } = useParams()

  const divisions = useDivisions(slug)
  const roles = useVolunteerRoles(slug)
  const locations = useWorkoutLocations(slug)
  const settings = useSettings(slug)
  const logo = useLogo()

  const addDivision = useAddDivision(slug)
  const importDivisions = useImportDivisions(slug)
  const saveDivision = useSaveDivision(slug)
  const reorderDivisions = useReorderDivisions(slug)
  const deleteDivision = useDeleteDivision(slug)

  const addLocation = useAddWorkoutLocation(slug)
  const saveLocation = useSaveWorkoutLocation(slug)
  const deleteLocation = useDeleteWorkoutLocation(slug)

  const addRole = useAddVolunteerRole(slug)
  const saveRole = useSaveVolunteerRole(slug)
  const deleteRole = useDeleteVolunteerRole(slug)
  const importRoles = useImportVolunteerRoles(slug)

  const updateSettings = useUpdateSettings(slug)
  const uploadLogo = useUploadLogo()
  const removeLogo = useRemoveLogo()

  const [error, setError] = useState<string | null>(null)

  /** v1's `run`: the label names the act, the message says what went wrong, and
      the two are shown together at the top of the screen. Re-thrown so the
      section that asked knows the write did not land — which is what keeps a
      half-typed name in the sheet it was typed in. */
  function run<T>(label: string, write: Promise<T>): Promise<T> {
    setError(null)
    return write.catch((e: unknown) => {
      setError(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    })
  }

  // A delete is asked about in a ConfirmDialog, and the dialog holds the
  // failure itself rather than closing on one — so it does not go through the
  // banner as v1's window.confirm deletes did.

  const patch = (label: string, next: SettingsPatch) => run(label, updateSettings.mutateAsync(next))

  const rows = divisions.data ?? []

  /** A failed read is not an empty list: "No divisions yet" would invite the
      admin to re-create divisions that exist. Each section reports its own
      failed read in its own place, so the ones that loaded keep working. */
  const failed = (what: string, err: Error) => (
    <EmptyState title={`Could not load the ${what}`} description={err.message} />
  )

  /** An unanswered read is not an empty list either: a section drawn with no
      rows while its read is in flight says "No divisions yet" about divisions
      that exist, then redraws full a beat later. */
  const loading = <div aria-busy="true"><Skeleton lines={3} /></div>

  return (
    <PageFrame title="Setup" description="Competition structure and roles" wide>
      {error && (
        <Notice tone="danger" onDismiss={() => setError(null)} dismissLabel="Dismiss error">
          {error}
        </Notice>
      )}

      <div className={styles.layout}>
        <SectionNav links={LINKS} className={styles.nav} />

        <Stack gap="section" className={styles.sections}>
          <div id="setup-settings">
            {settings.isPending && loading}
            {!settings.data && settings.error && failed('settings', settings.error)}
            {settings.data && (
              <CompetitionSettingsSection
                showBib={settings.data.showBib}
                leaderboardVisibility={settings.data.leaderboardVisibility}
                judgePassword={settings.data.judgePassword ?? 'rug702'}
                judgeMaxConsecutive={settings.data.judgeMaxConsecutive ?? 3}
                onPatch={(next) => patch('Save setting', next)}
              />
            )}
          </div>

          <div id="setup-logo">
            {logo.isPending ? (
              loading
            ) : !logo.data && logo.error ? (
              failed('logo', logo.error)
            ) : (
              <LogoSection
                url={logo.data?.url ?? null}
                busy={uploadLogo.isPending || removeLogo.isPending}
                onUpload={(file) => run('Upload logo', uploadLogo.mutateAsync(file))}
                onRemove={() => run('Remove logo', removeLogo.mutateAsync())}
              />
            )}
          </div>

          <div id="setup-tv">
            {/* The TV table is keyed by division name, so it needs both reads:
                a failed divisions read must not render as "No divisions to show". */}
            {(settings.isPending || divisions.isPending) && loading}
            {!settings.data && settings.error && failed('TV leaderboard', settings.error)}
            {settings.data && !divisions.data && divisions.error && failed('TV leaderboard', divisions.error)}
            {settings.data && !(divisions.error && !divisions.data) && (
              <TvLeaderboardSection
                divisions={rows}
                order={settings.data.tvLeaderboardOrder ?? {}}
                percentages={settings.data.tvLeaderboardPercentages ?? {}}
                onSaveOrder={(next) => patch('Save TV order', { tvLeaderboardOrder: next })}
                onSavePercentages={(next) => patch('Save TV percentages', { tvLeaderboardPercentages: next })}
              />
            )}
          </div>

          <div id="setup-divisions">
            {divisions.isPending ? (
              loading
            ) : !divisions.data && divisions.error ? (
              failed('divisions', divisions.error)
            ) : (
              <DivisionsSection
                rows={rows}
                busy={addDivision.isPending || saveDivision.isPending || importDivisions.isPending}
                onAdd={(input) => run('Add division', addDivision.mutateAsync(input))}
                onAddMany={(inputs) => run('Import divisions', importDivisions.mutateAsync(inputs))}
                onSave={(id, input) => run('Save division', saveDivision.mutateAsync({ id, ...input }))}
                onMove={(from, to) => run('Reorder division', reorderDivisions.mutateAsync({ rows, from, to }))}
                onDelete={(id) => deleteDivision.mutateAsync(id)}
              />
            )}
          </div>

          <div id="setup-locations">
            {locations.isPending ? (
              loading
            ) : !locations.data && locations.error ? (
              failed('locations', locations.error)
            ) : (
            <NamedListSection
              title="Workout Locations"
              description="Define the venues or areas where workouts take place."
              columnHeader="Location"
              noun="location"
              emptyTitle="No locations yet"
              emptyDescription="A workout can be assigned to one, so the schedule says where to go."
              placeholder="e.g. Main Floor, Turf Field, Parking Lot"
              deleteDescription={(name) =>
                `Delete location "${name}"? Workouts assigned to this location will be unassigned.`}
              rows={locations.data ?? []}
              busy={addLocation.isPending || saveLocation.isPending}
              onAdd={(name) => run('Add location', addLocation.mutateAsync(name))}
              onSave={(id, name) => run('Save location', saveLocation.mutateAsync({ id, name }))}
              onDelete={(id) => deleteLocation.mutateAsync(id)}
            />
            )}
          </div>

          <div id="setup-roles">
            {roles.isPending ? (
              loading
            ) : !roles.data && roles.error ? (
              failed('volunteer roles', roles.error)
            ) : (
            <NamedListSection
              title="Volunteer Roles"
              description="Define the roles available for volunteers at this competition."
              columnHeader="Role"
              noun="volunteer role"
              emptyTitle="No volunteer roles yet"
              emptyDescription="A volunteer is entered under one, so the roster says what they are here to do."
              placeholder="e.g. Judge, Timer, Scorekeeper"
              deleteDescription={(name) => `Delete volunteer role "${name}"?`}
              rows={roles.data ?? []}
              busy={addRole.isPending || saveRole.isPending || importRoles.isPending}
              onAdd={(name) => run('Add role', addRole.mutateAsync(name))}
              onAddMany={(names) => run('Import roles', importRoles.mutateAsync(names))}
              onSave={(id, name) => run('Save role', saveRole.mutateAsync({ id, name }))}
              onDelete={(id) => deleteRole.mutateAsync(id)}
            />
            )}
          </div>
        </Stack>
      </div>
    </PageFrame>
  )
}
