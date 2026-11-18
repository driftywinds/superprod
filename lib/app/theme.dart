import 'package:material_ui/material_ui.dart';

/// Brand blue, taken from `assets/branding/logo.svg`.
const brandBlue = Color(0xFF3094DE);

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: brandBlue,
    brightness: brightness,
  );
  return ThemeData(
    colorScheme: scheme,
    // Dense by default: this app is a list of tasks, not a marketing page.
    visualDensity: VisualDensity.compact,
  );
}
