# Group buses

GALLEY has ten main tracks, two group buses, two send returns and a master.
Group buses combine tracks so one set of effects and mix controls can shape them
together.

1. Choose **Output → Bus 1** or **Bus 2** below the sends on any mixer channel.
   The selected-track card also has an **Output** menu.
2. Open **Groups, sends & master** below the track rack. Rename the bus if useful.
3. Set its level and pan, or add effects to its four insert slots.
4. Choose **Master** in a track’s Output menu to return it to the direct mix.

A track has one main destination. Routing it to a bus replaces its direct Master
feed, so it does not play twice. The bus receives that track’s processed,
panned and level-adjusted stereo signal. Bus 1 and Bus 2 both feed Master; they
cannot feed each other or create feedback loops. The master inserts, level,
mastering, Speed and Pitch still finish the complete mix.

| Example | Main output |
| --- | --- |
| Kick, snare, hats and percussion | Bus 1, named “Drums” |
| Lead and backing vocals | Bus 2, named “Voices” |
| Bass, guitar and other tracks | Master |

The existing Send A/B controls remain independent source-track taps. A group’s
Mute silences its main output; its source tracks can still feed the returns.
Solo includes the group’s source tracks and their sends. A muted source track
remains muted, and a track with its power off does not feed a group or return.

Each group has four standard GALLEY inserts, its own meters, level, pan, Mute
and Solo. Select the group to edit its automation. The four LFOs can target
group mix controls or effect parameters in the same way as track and return
parameters. Output selection is a discrete routing choice.

Track freeze stores the track’s source and sends before group processing.
Group effects and automation remain live. You can change a frozen track’s
Output, or change its destination bus, without rebuilding that track’s cache.
Unfreeze restores the editable track with its current output selection.

Export **Bus 1** or **Bus 2** for a processed group WAV. Group stems include the
assigned tracks, group inserts, pan and level, and skip returns and the master
chain, mastering, Speed and Pitch. Individual track stems are taken before group
processing. The complete fourteen-stem ZIP contains ten individual tracks, two
groups and two wet returns: track and group files overlap, so choose the files
you need when rebuilding a mix elsewhere.

Older projects gain two empty buses and keep all ten tracks routed to Master.
The default direct route retains its previous audio. Unused buses do not run
effect processing; a bus that has just stopped receiving tracks can finish its
existing effect tail.

Run `npm run check:group-buses` and `npm run check:group-buses-browser` from the
repository. The equivalent `group-bus-*-checks.cjs` files are included in the
editable source download.
