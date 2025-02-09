export default {
  template: `
    <div></div>
  `,
  props: {
    value: String,
    language: String,
    theme: String,
    resource_path: String,
    lineWrapping: Boolean,
    disable: Boolean,
    indent: String,
    highlightWhitespace: Boolean,
  },
  watch: {
    value(newValue) {
      this.setEditorValue(newValue);
    },
    language(newLanguage) {
      this.setLanguage(newLanguage);
    },
    theme(newTheme) {
      this.setTheme(newTheme);
    },
    disable(newDisable) {
      this.setDisabled(newDisable);
    },
  },
  data() {
    return {
      editorPromise: new Promise((resolve) => {
        this.resolveEditor = resolve;
      }),
      highlightCompartment: null,
    };
  },

  methods: {
    findLanguage(name) {
      for (const language of this.languages)
        for (const alias of [language.name, ...language.alias])
          if (name.toLowerCase() === alias.toLowerCase()) return language;

      console.error(`Language not found: ${this.language}`);
      console.info("Supported language names:", this.languages.map((lang) => lang.name).join(", "));
      return null;
    },

    async getLanguages() {
      if (!this.editor) await this.editorPromise;
      return this.languages.map((lang) => lang.name).sort(Intl.Collator("en").compare);
    },

    setLanguage(language) {
      if (!language) {
        this.editor.dispatch({
          effects: this.languageConfig.reconfigure([]),
        });
        return;
      }

      const lang_description = this.findLanguage(language);
      if (!lang_description) {
        console.error("Language not found:", language);
        return;
      }

      lang_description.load().then((extension) => {
        this.editor.dispatch({
          effects: this.languageConfig.reconfigure([extension]),
        });
      });
    },

    async getThemes() {
      if (!this.editor) await this.editorPromise;
      return Object.keys(this.themes)
        .filter((key) => Array.isArray(this.themes[key]))
        .sort(Intl.Collator("en").compare);
    },

    setTheme(theme) {
      const new_theme = this.themes[theme];
      if (new_theme === undefined) {
        console.error("Theme not found:", theme);
        return;
      }
      this.editor.dispatch({
        effects: this.themeConfig.reconfigure([new_theme]),
      });
    },

    setEditorValue(value) {
      if (!this.editor) return;
      if (this.editor.state.doc.toString() === value) return;

      this.emitting = false;
      this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: value } });
      this.emitting = true;
    },

    setDisabled(disabled) {
      this.editor.dispatch({
        effects: this.editableConfig.reconfigure(this.editableStates[!disabled]),
      });
    },

    highlightText(from_pos, to_pos) {
      if (!this.editor || !this.CM) return;

      // Clear any existing highlight first
      this.clearHighlight();

      // Create the decoration
      const decoration = this.CM.Decoration.mark({
        class: "cm-highlight-selection"
      });

      // Create a decoration set
      const decorationSet = this.CM.Decoration.set([
        decoration.range(from_pos, to_pos)
      ]);

      // Apply the highlight using the compartment
      if (this.highlightCompartment) {
        console.log("Inside Highlight Compartment")
        this.editor.dispatch({
        effects: this.highlightCompartment.reconfigure(
          this.CM.EditorView.decorations.of(decorationSet)
        )
      });
      }
    },

    clearHighlight() {
      if (!this.editor || !this.highlightCompartment) return;
      
      // Simply reconfigure the compartment with an empty decoration set
      this.editor.dispatch({
        effects: this.highlightCompartment.reconfigure(
          this.CM.EditorView.decorations.of(this.CM.Decoration.none)
        )
      });
    },

    setupExtensions() {
      const CM = this.CM;
      const self = this;

      // Initialize the highlight compartment
      //const highlightCompartment = new CM.Compartment
      //highlightCompartment.of(this.CM.Decoration.none)
      //highlightCompartment.reconfigure(this.CM.Decoration.none)

      const changeSender = CM.ViewPlugin.fromClass(
        class {
          update(update) {
            if (!update.docChanged) return;
            if (!self.emitting) return;
            self.$emit("update:value", update.changes);
          }
        }
      );

      const extensions = [
        CM.basicSetup,
        changeSender,
        CM.keymap.of([CM.indentWithTab]),
        CM.indentUnit.of(this.indent),
        this.themeConfig.of([]),
        this.languageConfig.of([]),
        this.editableConfig.of([]),
        // Initialize highlight compartment with no decorations
        this.highlightCompartment.of(this.CM.EditorView.decorations.of(this.CM.Decoration.none)),
        //this.highlightCompartment.of(this.CM.Decoration.none),
        // Add highlighting styles to theme
        CM.EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-highlight-selection": {
            backgroundColor: "#ffeb3b50"
          }
        }),
        //highlightCompartment
      ];

      if (this.lineWrapping) extensions.push(CM.EditorView.lineWrapping);
      if (this.highlightWhitespace) extensions.push([CM.highlightWhitespace()]);
      

      return extensions;
    },
  },
  async mounted() {
    await this.$nextTick();
    this.CM = await import(window.path_prefix + `${this.resource_path}/editor.js`);
    const CM = this.CM;

    this.emitting = true;
    this.themes = { ...CM.themes, oneDark: CM.oneDark };
    this.themeConfig = new CM.Compartment();
    this.languages = CM.languages;
    this.languageConfig = new CM.Compartment();
    this.editableConfig = new CM.Compartment();
    this.editableStates = { 
      true: CM.EditorView.editable.of(true), 
      false: CM.EditorView.editable.of(false) 
    };
    this.highlightCompartment = new CM.Compartment();

    const extensions = this.setupExtensions();

    this.editor = new CM.EditorView({
      doc: this.value,
      extensions: extensions,
      parent: this.$el,
    });
    
    //this.editor.dispatch({
    //    effects: this.highlightCompartment.reconfigure(this.CM.Decoration.none)
    //  });

    this.resolveEditor(this.editor);

    this.setLanguage(this.language);
    this.setTheme(this.theme);
    this.setDisabled(this.disable);
  },
};
