// @ts-nocheck
import * as __fd_glob_31 from "../content/docs/visual-explainers/index.mdx?collection=docs"
import * as __fd_glob_30 from "../content/docs/symphony/prompts.mdx?collection=docs"
import * as __fd_glob_29 from "../content/docs/symphony/notifications.mdx?collection=docs"
import * as __fd_glob_28 from "../content/docs/symphony/monitoring.mdx?collection=docs"
import * as __fd_glob_27 from "../content/docs/symphony/index.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/symphony/deployment.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/symphony/configuration.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/symphony/backends.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/orchestrator/index.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/getting-started/quickstart.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/getting-started/installation.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/desktop/index.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/context/index.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/cli/preferences.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/cli/kata-workflow.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/cli/index.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/cli/extensions.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/cli/commands.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/cli/agents.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/architecture/packages.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/architecture/index.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/architecture/conventions.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_8 } from "../content/docs/visual-explainers/meta.json?collection=docs"
import { default as __fd_glob_7 } from "../content/docs/symphony/meta.json?collection=docs"
import { default as __fd_glob_6 } from "../content/docs/orchestrator/meta.json?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/desktop/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/context/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/cli/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/architecture/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "architecture/meta.json": __fd_glob_1, "cli/meta.json": __fd_glob_2, "context/meta.json": __fd_glob_3, "desktop/meta.json": __fd_glob_4, "getting-started/meta.json": __fd_glob_5, "orchestrator/meta.json": __fd_glob_6, "symphony/meta.json": __fd_glob_7, "visual-explainers/meta.json": __fd_glob_8, }, {"index.mdx": __fd_glob_9, "architecture/conventions.mdx": __fd_glob_10, "architecture/index.mdx": __fd_glob_11, "architecture/packages.mdx": __fd_glob_12, "cli/agents.mdx": __fd_glob_13, "cli/commands.mdx": __fd_glob_14, "cli/extensions.mdx": __fd_glob_15, "cli/index.mdx": __fd_glob_16, "cli/kata-workflow.mdx": __fd_glob_17, "cli/preferences.mdx": __fd_glob_18, "context/index.mdx": __fd_glob_19, "desktop/index.mdx": __fd_glob_20, "getting-started/installation.mdx": __fd_glob_21, "getting-started/quickstart.mdx": __fd_glob_22, "orchestrator/index.mdx": __fd_glob_23, "symphony/backends.mdx": __fd_glob_24, "symphony/configuration.mdx": __fd_glob_25, "symphony/deployment.mdx": __fd_glob_26, "symphony/index.mdx": __fd_glob_27, "symphony/monitoring.mdx": __fd_glob_28, "symphony/notifications.mdx": __fd_glob_29, "symphony/prompts.mdx": __fd_glob_30, "visual-explainers/index.mdx": __fd_glob_31, });