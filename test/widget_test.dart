import 'package:flutter_test/flutter_test.dart';
import 'package:superprod/app/app.dart';

void main() {
  testWidgets('boots to the branded shell', (tester) async {
    await tester.pumpWidget(const SuperprodApp());
    expect(find.text('superprod'), findsOneWidget);
  });
}
