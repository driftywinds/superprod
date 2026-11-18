import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/shell.dart';
import 'app/theme.dart';
import 'data/providers.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: SuperprodApp()));
}

class SuperprodApp extends ConsumerWidget {
  const SuperprodApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The Inbox must exist before the first task is added.
    final database = ref.watch(databaseProvider);
    database.ensureDefaults();

    return MaterialApp(
      title: 'superprod',
      debugShowCheckedModeBanner: false,
      theme: SuperprodTheme.build(),
      darkTheme: SuperprodTheme.build(),
      themeMode: ThemeMode.dark,
      home: const AppShell(),
    );
  }
}
