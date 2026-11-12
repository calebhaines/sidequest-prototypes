# License scope of the native Kitchen integration

The new native integration code added under `plugins/` is free software: you
may redistribute it and/or modify it under the terms of the GNU Affero General
Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version.

This integration is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See [AGPL-3.0.txt](AGPL-3.0.txt) for the full terms.

This declaration covers the newly authored native host, adapters, plugin
editor bridge, build integration and native plugin tests. It does not
relicense the repository as a whole, unrelated projects, the canonical web
source files outside `plugins/`, copied third party software, license texts,
model weights, speaker data or generated audio. Those retain their existing
copyrights and applicable terms, as recorded in
[../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

The default build uses JUCE 8.0.12 under its AGPLv3 option. The separate JUCE
commercial agreement is included as an upstream alternative, not as a license
granted by this repository. A commercial JUCE license does not replace other
components' licenses, including MORSEL's GPLv3 integration. The original
copyright holders retain their rights in their respective contributions.

When distributing a combined plugin build, retain the notices and provide its
complete corresponding source under the applicable terms. The source and
build contents are described in [SOURCE-AND-BUILD.md](SOURCE-AND-BUILD.md).
