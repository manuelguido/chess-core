<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link rel="icon" type="image/png" href="/favicon.png">

    <title inertia>{{ config('app.name', 'Chess Core') }}</title>

    <link rel="stylesheet" href="https://use.typekit.net/kel0gqi.css">

    @vite(['resources/css/app.css', 'resources/js/app.js'])

    @inertiaHead
</head>

<body>
    @inertia
</body>

</html>