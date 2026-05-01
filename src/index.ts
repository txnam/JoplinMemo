import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';
import { registerMemoEditor } from './editor/registerMemoEditor';

joplin.plugins.register({
	onStart: async () => {
		const versionInfo = await joplin.versionInfo();
		const commandName = await registerMemoEditor();

		try {
			await joplin.views.toolbarButtons.create(
				'joplinmemo-view-as-memos-toolbar-button',
				commandName,
				versionInfo.platform === 'desktop' ? ToolbarButtonLocation.NoteToolbar : ToolbarButtonLocation.EditorToolbar,
			);
		} catch (error) {
			console.warn('Could not create the JoplinMemo toolbar button:', error);
		}
	},
});
