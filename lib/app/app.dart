import 'package:material_ui/material_ui.dart';

import '../features/home/home_screen.dart';
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
      home: const HomeScreen(),
    );
  }
}
