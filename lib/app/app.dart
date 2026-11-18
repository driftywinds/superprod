import 'package:flutter_svg/flutter_svg.dart';
import 'package:material_ui/material_ui.dart';

import 'theme.dart';

class SuperprodApp extends StatelessWidget {
  const SuperprodApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'superprod',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      home: const _Boot(),
    );
  }
}

/// Placeholder until M1 lands Today; exists so the shell can be verified.
class _Boot extends StatelessWidget {
  const _Boot();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/branding/logo.svg',
              width: 88,
              height: 88,
              semanticsLabel: 'superprod',
            ),
            const SizedBox(height: 20),
            Text('superprod', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              'Local-first tasks.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
