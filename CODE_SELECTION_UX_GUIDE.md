# Code Selection UX - Best Practices and Common Issues

## Problem: Selection Becomes Locked After First Choice

### Common Causes

#### 1. TextEditingController Recreated in build()

**❌ WRONG**:

```dart
@override
Widget build(BuildContext context) {
  final controller = TextEditingController(text: selectedCode);  // Recreated every build!

  return TextField(
    controller: controller,
    onChanged: (value) => setState(() => selectedCode = value),
  );
}
```

**✅ CORRECT**:

```dart
class _MyWidgetState extends State<MyWidget> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialCode);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: (value) => setState(() => selectedCode = value),
    );
  }
}
```

#### 2. readOnly or enabled Set After Selection

**❌ WRONG**:

```dart
TextField(
  controller: _controller,
  readOnly: _hasSelection,  // Locks after selection!
  enabled: !_hasSelection,  // Locks after selection!
)
```

**✅ CORRECT**:

```dart
TextField(
  controller: _controller,
  readOnly: false,  // Always editable
  enabled: true,    // Always enabled
  decoration: InputDecoration(
    suffixIcon: _hasSelection
        ? IconButton(
            icon: Icon(Icons.edit),
            onPressed: () => _controller.clear(),
          )
        : null,
  ),
)
```

#### 3. IgnorePointer/AbsorbPointer Wrapping

**❌ WRONG**:

```dart
IgnorePointer(
  ignoring: _hasSelection,  // Blocks all interactions!
  child: TextField(controller: _controller),
)
```

**✅ CORRECT**:

```dart
// Don't wrap with IgnorePointer
TextField(
  controller: _controller,
  enabled: true,
)
```

#### 4. onChanged Set to null After Selection

**❌ WRONG**:

```dart
TextField(
  controller: _controller,
  onChanged: _hasSelection ? null : (value) => _handleChange(value),  // Disables editing!
)
```

**✅ CORRECT**:

```dart
TextField(
  controller: _controller,
  onChanged: (value) => _handleChange(value),  // Always enabled
)
```

#### 5. Controller Text Reset on setState

**❌ WRONG**:

```dart
void _selectCode(String code) {
  setState(() {
    _controller.text = code;  // Resets cursor position!
    _selectedCode = code;
  });
}
```

**✅ CORRECT**:

```dart
void _selectCode(String code) {
  _controller.text = code;  // Update controller first
  setState(() {
    _selectedCode = code;  // Then update state
  });
}
```

### Best Practices

#### 1. Separate Template Selection from Text Editing

```dart
class CodeSelectionWidget extends StatefulWidget {
  @override
  State<CodeSelectionWidget> createState() => _CodeSelectionWidgetState();
}

class _CodeSelectionWidgetState extends State<CodeSelectionWidget> {
  late final TextEditingController _controller;
  String? _selectedTemplateId;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _selectTemplate(String templateId, String templateText) {
    setState(() {
      _selectedTemplateId = templateId;
      _controller.text = templateText;  // Update text
    });
  }

  void _clearSelection() {
    setState(() {
      _selectedTemplateId = null;
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Template selector
        ElevatedButton(
          onPressed: () async {
            final result = await showTemplateSelector(context);
            if (result != null) {
              _selectTemplate(result.id, result.text);
            }
          },
          child: Text(_selectedTemplateId == null
              ? 'Select Template'
              : 'Change Template'),
        ),

        // Editable text field
        TextField(
          controller: _controller,
          enabled: true,  // Always enabled
          decoration: InputDecoration(
            labelText: 'Code',
            suffixIcon: _selectedTemplateId != null
                ? IconButton(
                    icon: Icon(Icons.clear),
                    onPressed: _clearSelection,
                    tooltip: 'Clear selection',
                  )
                : null,
          ),
        ),

        // Action buttons
        Row(
          children: [
            if (_selectedTemplateId != null)
              TextButton(
                onPressed: _clearSelection,
                child: Text('Reset'),
              ),
            ElevatedButton(
              onPressed: () => _submit(_controller.text),
              child: Text('Submit'),
            ),
          ],
        ),
      ],
    );
  }
}
```

#### 2. Provider Pattern for Shared State

```dart
class CodeSelectionProvider extends ChangeNotifier {
  String? _selectedTemplateId;
  String _currentText = '';

  String? get selectedTemplateId => _selectedTemplateId;
  String get currentText => _currentText;

  void selectTemplate(String templateId, String templateText) {
    _selectedTemplateId = templateId;
    _currentText = templateText;
    notifyListeners();
  }

  void updateText(String text) {
    _currentText = text;
    // Don't clear template ID - user is editing
    notifyListeners();
  }

  void clearSelection() {
    _selectedTemplateId = null;
    _currentText = '';
    notifyListeners();
  }
}

// In widget:
class CodeSelectionWidget extends StatefulWidget {
  @override
  State<CodeSelectionWidget> createState() => _CodeSelectionWidgetState();
}

class _CodeSelectionWidgetState extends State<CodeSelectionWidget> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    final provider = context.read<CodeSelectionProvider>();
    _controller = TextEditingController(text: provider.currentText);

    // Sync controller with provider
    _controller.addListener(() {
      provider.updateText(_controller.text);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<CodeSelectionProvider>(
      builder: (context, provider, child) {
        // Update controller if provider changed externally
        if (_controller.text != provider.currentText) {
          _controller.text = provider.currentText;
        }

        return TextField(
          controller: _controller,
          enabled: true,  // Always enabled
        );
      },
    );
  }
}
```

#### 3. Clear Action Buttons

Always provide clear actions:

```dart
Row(
  children: [
    // Edit button (if using readOnly mode)
    if (_isReadOnly)
      IconButton(
        icon: Icon(Icons.edit),
        onPressed: () => setState(() => _isReadOnly = false),
        tooltip: 'Edit',
      ),

    // Change selection button
    IconButton(
      icon: Icon(Icons.swap_horiz),
      onPressed: _showTemplateSelector,
      tooltip: 'Change template',
    ),

    // Clear button
    IconButton(
      icon: Icon(Icons.clear),
      onPressed: () {
        _controller.clear();
        setState(() => _selectedTemplateId = null);
      },
      tooltip: 'Clear',
    ),
  ],
)
```

### Testing

#### Widget Test Example

```dart
testWidgets('Can edit text after template selection', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: CodeSelectionWidget(),
      ),
    ),
  );

  // Select template
  await tester.tap(find.text('Select Template'));
  await tester.pumpAndSettle();

  await tester.tap(find.text('Template A'));
  await tester.pumpAndSettle();

  // Verify template text is set
  expect(find.text('Template A text'), findsOneWidget);

  // Try to edit
  await tester.enterText(find.byType(TextField), 'Modified text');
  await tester.pumpAndSettle();

  // Verify text was updated
  expect(find.text('Modified text'), findsOneWidget);
});

testWidgets('Can change selection', (tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: CodeSelectionWidget(),
      ),
    ),
  );

  // Select first template
  await tester.tap(find.text('Select Template'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Template A'));
  await tester.pumpAndSettle();

  expect(find.text('Template A text'), findsOneWidget);

  // Change selection
  await tester.tap(find.text('Change Template'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Template B'));
  await tester.pumpAndSettle();

  // Verify text was updated
  expect(find.text('Template B text'), findsOneWidget);
  expect(find.text('Template A text'), findsNothing);
});
```

### Checklist for Code Selection Components

- [ ] TextEditingController created in initState, not build()
- [ ] Controller disposed in dispose()
- [ ] TextField always has `enabled: true` (or conditional with clear reason)
- [ ] TextField never has `readOnly: true` after selection (unless intentional with Edit button)
- [ ] No IgnorePointer/AbsorbPointer wrapping the input
- [ ] onChanged callback always present (not set to null)
- [ ] Clear/Reset button visible when selection exists
- [ ] Change selection button visible when selection exists
- [ ] Controller text updates don't reset cursor position unnecessarily
- [ ] State management separates template ID from current text
- [ ] Widget tests cover: select → edit, select → change selection, clear

### Current Codebase Status

**Components checked**:

- ✅ `lib/widgets/assign_role_sheet.dart` - TextField always enabled, controller properly managed
- ✅ `lib/widgets/user_selector_dialog.dart` - Search TextField always enabled
- ✅ `lib/screens/evenimente/evenimente_screen.dart` - Filter TextFields always enabled

**No locking issues found** in current codebase. This guide serves as prevention for future development.

### If You Encounter This Issue

1. **Identify the component**: Which screen/widget has the locked selection?
2. **Check the patterns above**: Look for the common causes
3. **Add logging**:
   ```dart
   print('Controller text: ${_controller.text}');
   print('Is enabled: ${_isEnabled}');
   print('Is readOnly: ${_isReadOnly}');
   ```
4. **Test in isolation**: Create a minimal widget test to reproduce
5. **Apply the fix**: Use the correct patterns from this guide

### Future Development

When creating new code selection components:

1. Start with the "Best Practices" template above
2. Add widget tests immediately
3. Test manually: select → edit → change → clear
4. Document any intentional read-only behavior
